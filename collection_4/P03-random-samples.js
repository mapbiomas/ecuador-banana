/**
 * @name
 *      P03-random-samples.js
 *
 * @description
 *      Banana cross-cutting theme - MapBiomas Ecuador Collection 4.
 *      Step 3: training samples for the banana classification of one region.
 *
 *      1. Draws random points over the stable pixels of P02, stratified by
 *         class: `samples.banana` points of class 74 (banana) and
 *         `samples.other` points of class 27 (not banana). Class 21 is not
 *         sampled.
 *      2. For each year in `yearsExport`, reads at those points the mosaic
 *         bands plus elevation, slope, slope position and shade mask. The
 *         same points are used for every year.
 *      3. Exports one table of samples per year (and optionally a CSV to Drive).
 *
 * @usage
 *      1. Run P02-stable-pixels.js and export the stable pixels (version `versionInput`).
 *      2. Set PARAMS, run and check the number of samples per class in the console.
 *      3. Start the export tasks from the Tasks tab.
 *
 * @inputs
 *      - Stable pixels from P02: <paths.pathStablePixelsBananaAct>ME-<COUNTRY>-<regionId>-<versionInput>
 *      - Annual mosaics (LULC step 1) and terrain layers.
 *
 * @outputs
 *      One table per year:
 *      <paths.pathTrainingSamplesBananaAct>samples-<COUNTRY>-<regionId>-<year>-p03-<versionOutput>
 *      Each point has 'reference' (27 or 74), 'year' and one property per band.
 *
 * @author
 *      MapBiomas Ecuador Team - EcoCiencia
 *
 * @version
 *      1.0.0 (2025-07-29)
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

  versionInput: 991,                // stable pixels from P02
  versionOutput: 992,

  yearsExport: [1985, 1997, 1998, 1999, 2000],
  yearsPreview: [1985],

  // Number of random points per class.
  samples: {
    banana: 2000,    // class 74
    other: 1000      // class 27
  },

  // true: also export each table to Google Drive as CSV.
  drive: false,
  driveFolder: 'BANANA-SAMPLES-EXPORTS'
};


// =============================================================================
// 2. MODULES, ASSETS AND CONSTANTS
// =============================================================================

var paths = require('users/mapbiomasecuador/LULC:COLECCION4/05-modules/CollectionDirectories.js').paths;
var palette = require('users/mapbiomasecuador/LULC:MODULES/Palettes.js').get('EcuadorCol4');

var BANANA = 74;
var OTHER = 27;

var CLASS_VIS = { min: 0, max: palette.length - 1, palette: palette };
var MOSAIC_VIS = { bands: ['nir_median', 'swir1_median', 'red_median'], min: 0, max: 5133, gamma: 1.06 };
var SAVI_VIS = {
  bands: ['savi_median'], min: 10265, max: 16656,
  palette: ['ffeda0', 'fed976', 'feb24c', 'fd8d3c', 'f03b20', 'bd0026']
};

// Terrain variables added to every mosaic. The banana classifier must use
// the same band names.
var dem = ee.Image('JAXA/ALOS/AW3D30_V1_1').select('AVE');

var TERRAIN = ee.Image.cat(
  dem.rename('elevation'),
  ee.Terrain.slope(dem).rename('slope'),
  ee.Image('projects/mapbiomas-raisg/MOSAICOS/slppost2_30_v2').rename('slppost'),
  ee.Image('projects/mapbiomas-raisg/MOSAICOS/shademask2_v2').rename('shade_mask2')
);


// =============================================================================
// 3. FUNCTIONS
// =============================================================================

/**
 * Mosaic of a year. From 2022 on, Landsat 8 is used.
 * TODO: no 2026 mosaic yet; the 2025 Landsat 9 mosaic is used instead.
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
// 4. SAMPLES
// =============================================================================

var region = ee.FeatureCollection(paths.pathRegionesBanana)
  .filter(ee.Filter.eq('region', PARAMS.regionId));

var regionMask = region
  .map(function (f) { return f.set('version', 1); })
  .reduceToImage(['version'], ee.Reducer.first());

var mosaics = ee.ImageCollection(paths.mosaicRaisgAct)
  .merge(ee.ImageCollection(paths.mosaicPacificoAct))
  .filterBounds(region);

var stablePixels = ee.Image(paths.pathStablePixelsBananaAct + 'ME-' + PARAMS.country + '-' +
  PARAMS.regionId + '-' + PARAMS.versionInput)
  .updateMask(regionMask)
  .rename('reference');

// Stratified random points (drawn once, used for every year).
var points = stablePixels
  .addBands(ee.Image.pixelLonLat())
  .stratifiedSample({
    numPoints: 0,
    classBand: 'reference',
    region: stablePixels.geometry(),
    scale: 30,
    seed: 1,
    geometries: true,
    dropNulls: false,
    classValues: [OTHER, BANANA],
    classPoints: [PARAMS.samples.other, PARAMS.samples.banana]
  });

PARAMS.yearsExport.forEach(function (year) {
  var yearMosaic = getYearMosaic(mosaics, year)
    .addBands(TERRAIN)
    .updateMask(regionMask);

  var training = stablePixels
    .addBands(yearMosaic)
    .sampleRegions({
      collection: points,
      properties: ['reference'],
      scale: 30,
      geometries: true,
      tileScale: 2
    })
    .map(function (feature) { return feature.set('year', year); });

  print('Samples ' + year + ' by class', training.aggregate_histogram('reference'));

  var fileName = 'samples-' + PARAMS.country + '-' + PARAMS.regionId + '-' + year + '-p03-' + PARAMS.versionOutput;

  Export.table.toAsset(training, fileName, paths.pathTrainingSamplesBananaAct + fileName);

  if (PARAMS.drive) {
    Export.table.toDrive({
      collection: training,
      description: 'DRIVE-' + fileName,
      folder: PARAMS.driveFolder,
      fileNamePrefix: fileName,
      fileFormat: 'CSV'
    });
  }

  // Banana samples in purple, others in gray.
  var styledSamples = training.map(function (feature) {
    var color = ee.Algorithms.If(feature.getNumber('reference').eq(BANANA), 'purple', 'gray');
    return feature.set('style', { color: color, pointSize: 5 });
  });

  Map.addLayer(styledSamples.style({ styleProperty: 'style' }), {}, 'Samples ' + year, false);
});


// =============================================================================
// 5. MAP
// =============================================================================

Map.addLayer(region.style({ fillColor: 'FF000000', color: 'FF0000' }), {}, 'Region ' + PARAMS.regionId, false);

PARAMS.yearsPreview.forEach(function (year) {
  var yearMosaic = getYearMosaic(mosaics, year).updateMask(regionMask);
  Map.addLayer(yearMosaic, MOSAIC_VIS, 'Mosaic ' + year, false);
  Map.addLayer(yearMosaic, SAVI_VIS, 'SAVI ' + year, false);
});

Map.addLayer(stablePixels, CLASS_VIS, 'Stable pixels');
