/**
 * @name
 *      P07-spatial-filter.js
 *
 * @description
 *      Banana cross-cutting theme - MapBiomas Ecuador Collection 4.
 *      Step 7: spatial filter of the multiband banana classification.
 *
 *      Year by year, pixels that belong to a patch of the same class smaller
 *      than `minConnectedPixels` take the most frequent class around them
 *      (focal mode, 5-pixel square window). This removes isolated banana
 *      pixels and small holes inside plantations.
 *
 *      Pixels of the region with no value are set to 27 (not banana) before
 *      filtering.
 *
 * @usage
 *      1. Run P06-pre-gapfill.js and export its output (version `versionInput`).
 *      2. Set PARAMS, run and compare "Original <year>" and "Filtered <year>"
 *         over the mosaic.
 *      3. Start the export task from the Tasks tab.
 *
 * @inputs
 *      <paths.pathClassificationBananaFilterAct><COUNTRY>-<regionId>-<versionInput>
 *
 * @outputs
 *      <paths.pathClassificationBananaFilterAct><COUNTRY>-<regionId>-<versionOutput>
 *
 * @author
 *      MapBiomas Ecuador Team - EcoCiencia
 *
 * @version
 *      1.0.0 (2025)
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

  versionInput: 993,                // output of P06
  versionOutput: 994,

  // Years of the time series (all must exist in the input).
  years: { first: 1985, last: 2025 },

  yearsPreview: [2000],

  // Minimum patch size, in pixels (30 m). Must be <= 500.
  minConnectedPixels: 10,

  // true: diagonal neighbors count as connected (8-connectivity).
  eightConnected: true
};


// =============================================================================
// 2. MODULES AND CONSTANTS
// =============================================================================

var paths = require('users/mapbiomasecuador/LULC:COLECCION4/05-modules/CollectionDirectories.js').paths;
var palette = require('users/mapbiomasecuador/LULC:MODULES/Palettes.js').get('EcuadorCol4');

var OTHER = 27;

// connectedPixelCount stops counting at this size.
var MAX_PATCH_SIZE = 500;

// Focal mode window used to replace small patches.
var FOCAL_RADIUS = 5;   // pixels

var YEARS = [];
for (var y = PARAMS.years.first; y <= PARAMS.years.last; y++) { YEARS.push(y); }

var BAND_NAMES = YEARS.map(function (year) { return 'classification_' + year; });

var CLASS_VIS = { min: 0, max: palette.length - 1, palette: palette };
var MOSAIC_VIS = { bands: ['nir_median', 'swir1_median', 'red_median'], min: 0, max: 5133, gamma: 1.06 };


// =============================================================================
// 3. FUNCTIONS
// =============================================================================

/**
 * Spatial filter, year by year (see the description at the top).
 */
function spatialFilter(image) {
  var patchSize = image.select(BAND_NAMES).connectedPixelCount(MAX_PATCH_SIZE, PARAMS.eightConnected);

  return ee.Image.cat(BAND_NAMES.map(function (name) {
    var yearImage = image.select(name);

    var neighborhood = yearImage
      .focal_mode(FOCAL_RADIUS, 'square', 'pixels')
      .mask(patchSize.select(name).lt(PARAMS.minConnectedPixels))
      .reproject('EPSG:4326', null, 30);

    return yearImage.blend(neighborhood).rename(name);
  }));
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
// 4. SPATIAL FILTER
// =============================================================================

var region = ee.FeatureCollection(paths.pathRegionesBanana)
  .filter(ee.Filter.eq('region', PARAMS.regionId));

var regionMask = region
  .map(function (f) { return f.set('version', 1); })
  .reduceToImage(['version'], ee.Reducer.first());

var input = ee.Image(paths.pathClassificationBananaFilterAct + PARAMS.country + '-' + PARAMS.regionId + '-' + PARAMS.versionInput)
  .unmask(OTHER)
  .updateMask(regionMask);

print('Input image', input);

var filtered = spatialFilter(input)
  .updateMask(regionMask)
  .set({
    country: PARAMS.country,
    region: PARAMS.regionId,
    version: PARAMS.versionOutput,
    step: 'spatial filter',
    theme: 'Banana'
  });

print('Output image', filtered);


// =============================================================================
// 5. MAP
// =============================================================================

var mosaics = ee.ImageCollection(paths.mosaicRaisgAct)
  .merge(ee.ImageCollection(paths.mosaicPacificoAct))
  .filter(ee.Filter.eq('country', PARAMS.country))
  .filterBounds(region);

Map.addLayer(region.style({ fillColor: 'FF000000', color: 'FF0000' }), {}, 'Region ' + PARAMS.regionId, false);

// For each preview year: mosaic, input and filtered result (shown at 30 m).
PARAMS.yearsPreview.forEach(function (year) {
  var name = 'classification_' + year;
  Map.addLayer(getYearMosaic(mosaics, year).updateMask(regionMask), MOSAIC_VIS, 'Mosaic ' + year, false);
  Map.addLayer(input.select(name).reproject('EPSG:4326', null, 30), CLASS_VIS, 'Original ' + year, false);
  Map.addLayer(filtered.select(name).reproject('EPSG:4326', null, 30), CLASS_VIS, 'Filtered ' + year, false);
});


// =============================================================================
// 6. EXPORT
// =============================================================================

var fileName = PARAMS.country + '-' + PARAMS.regionId + '-' + PARAMS.versionOutput;

Export.image.toAsset({
  image: filtered.byte().reproject('EPSG:4326', null, 30),
  description: fileName,
  assetId: paths.pathClassificationBananaFilterAct + fileName,   // path must end with '/'
  scale: 30,
  pyramidingPolicy: { '.default': 'mode' },
  maxPixels: 1e13,
  region: region.geometry().bounds()
});
