/**
 * @name
 *      P06-pre-gapfill.js
 *
 * @description
 *      Banana cross-cutting theme - MapBiomas Ecuador Collection 4.
 *      Step 6: prepares the multiband banana classification (P05) for the
 *      filters by completing the time series:
 *
 *        1. Pixels of the region with no value in a year become 27
 *           (not banana).
 *        2. Years between `years.first` and `years.last` that are missing
 *           from the input are added as bands with value 27.
 *        3. Pixels with value 0 are masked.
 *
 *      Note: despite its name, this step does not copy classes from
 *      neighboring years; it only makes sure every year and every pixel of
 *      the region has a value before the filters.
 *
 * @usage
 *      1. Run P05-stack-multiband.js and export the stack (version `versionInput`).
 *      2. Set PARAMS, run, review the preview years and start the export task.
 *
 * @inputs
 *      <paths.pathClassificationBananaAct><COUNTRY>-<regionId>-<versionInput>
 *
 * @outputs
 *      <paths.pathClassificationBananaFilterAct><COUNTRY>-<regionId>-<versionOutput>
 *      one band 'classification_<year>' per year from years.first to years.last.
 *
 * @author
 *      MapBiomas Ecuador Team - EcoCiencia
 *
 * @version
 *      1.0.0 (2026)
 *
 * @theme
 *      Banana
 *
 * @collection
 *      4
 */


// =============================================================================
// 1. PARAMETERS
// =============================================================================

var PARAMS = {
  country: 'ECUADOR',
  regionId: 40901,                  // Banana classification region (field 'region')

  versionInput: 992,                // stack from P05
  versionOutput: 993,

  // Years of the output. Every band of the input must be inside this range.
  years: { first: 1985, last: 2025 },

  yearsPreview: [1985, 1986, 1988, 2000, 2023, 2024]
};


// =============================================================================
// 2. MODULES AND CONSTANTS
// =============================================================================

var paths = require('users/mapbiomasecuador/LULC:COLECCION4/05-modules/CollectionDirectories.js').paths;
var palette = require('users/mapbiomasecuador/LULC:MODULES/Palettes.js').get('EcuadorCol4');

var OTHER = 27;

var YEARS = [];
for (var y = PARAMS.years.first; y <= PARAMS.years.last; y++) { YEARS.push(y); }

var BAND_NAMES = YEARS.map(function (year) { return 'classification_' + year; });

var CLASS_VIS = { min: 0, max: palette.length - 1, palette: palette };
var MOSAIC_VIS = { bands: ['nir_median', 'swir1_median', 'red_median'], min: 0, max: 5133, gamma: 1.06 };


// =============================================================================
// 3. FUNCTIONS
// =============================================================================

/**
 * Returns an image with one band per name in BAND_NAMES. Missing years are
 * added with value 27; pixels with value 0 are masked; the result is masked
 * with the footprint of the first input band.
 */
function completeYears(image) {
  var inputBands = image.bandNames();
  var missingBands = ee.List(BAND_NAMES).removeAll(inputBands);

  print('Years added (missing in the input)', missingBands);

  var missingImages = ee.ImageCollection(missingBands.map(function (name) {
    return ee.Image(OTHER).rename(ee.String(name)).set('year', ee.String(name).slice(-4));
  }));

  var validImages = ee.ImageCollection(inputBands.map(function (name) {
    return image.select([name]).set('year', ee.String(name).slice(-4));
  }));

  return missingImages.merge(validImages)
    .map(function (band) { return band.updateMask(band.unmask()); })
    .sort('year')
    .toBands()
    .updateMask(image.select([inputBands.get(0)]))
    .rename(BAND_NAMES);
}

/**
 * Mosaic of a year. From 2022 on, Landsat 8 is used.
 * TODO: no 2026 mosaic yet; the 2025 Landsat 9 mosaic is shown instead.
 */
function getYearMosaic(mosaics, year) {
  if (year === 2026) {
    return mosaics.filter(ee.Filter.eq('year', 2025)).filter(ee.Filter.eq('satellite', 'l9')).mosaic();
  }
  var yearMosaics = mosaics.filter(ee.Filter.eq('year', year));
  if (year >= 2022) {
    yearMosaics = yearMosaics.filter(ee.Filter.eq('satellite', 'l8'));
  }
  return yearMosaics.mosaic();
}


// =============================================================================
// 4. PROCESS
// =============================================================================

var region = ee.FeatureCollection(paths.pathRegionesBanana)
  .filter(ee.Filter.eq('region', PARAMS.regionId));

var regionMask = region
  .map(function (f) { return f.set('version', 1); })
  .reduceToImage(['version'], ee.Reducer.first());

// Pixels of the region with no value become 27.
var input = ee.Image(paths.pathClassificationBananaAct + PARAMS.country + '-' + PARAMS.regionId + '-' + PARAMS.versionInput)
  .unmask(OTHER)
  .updateMask(regionMask);

print('Input image', input);

var output = completeYears(input).set({
  country: PARAMS.country,
  region: PARAMS.regionId,
  version: PARAMS.versionOutput,
  step: 'gapfill-1',
  theme: 'Banana'
});

print('Output image', output);


// =============================================================================
// 5. MAP
// =============================================================================

var mosaics = ee.ImageCollection(paths.mosaicRaisgAct)
  .merge(ee.ImageCollection(paths.mosaicPacificoAct))
  .filter(ee.Filter.eq('country', PARAMS.country))
  .filterBounds(region);

Map.addLayer(region.style({ fillColor: 'FF000000', color: 'FF0000' }), {}, 'Region ' + PARAMS.regionId, false);

// For each preview year: mosaic and output.
PARAMS.yearsPreview.forEach(function (year) {
  Map.addLayer(getYearMosaic(mosaics, year).updateMask(regionMask), MOSAIC_VIS, 'Mosaic ' + year, false);
  Map.addLayer(output.select('classification_' + year), CLASS_VIS, 'Output ' + year, false);
});


// =============================================================================
// 6. EXPORT
// =============================================================================

var fileName = PARAMS.country + '-' + PARAMS.regionId + '-' + PARAMS.versionOutput;

Export.image.toAsset({
  image: output.byte().reproject('EPSG:4326', null, 30),
  description: fileName,
  assetId: paths.pathClassificationBananaFilterAct + fileName,   // path must end with '/'
  scale: 30,
  pyramidingPolicy: { '.default': 'mode' },
  maxPixels: 1e13,
  region: region.geometry().bounds()
});
