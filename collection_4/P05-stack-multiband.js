/**
 * @name
 *      P05-stack-multiband.js
 *
 * @description
 *      Banana cross-cutting theme - MapBiomas Ecuador Collection 4.
 *      Step 5: stacks the annual banana classifications of one region (P04)
 *      into a single multiband image, one band per year
 *      ('classification_<year>').
 *
 *      The stack can combine two sources:
 *        - new years classified with P04 (one image per year),
 *        - years taken from a previous stack (one multiband image).
 *      If a year is in both, the new classification replaces the previous one.
 *
 * @usage
 *      1. Set PARAMS: region, years from each source and versions.
 *      2. Run, review the preview years and start the export task.
 *
 * @inputs
 *      - New years: <CURRENT_COLLECTION_PATH>BANANA-<COUNTRY>-<regionId>-<year>-<currentCollectionVersion>
 *      - Previous stack (optional): <PARAMS.previousCollectionPath><COUNTRY>-<regionId>-<previousCollectionVersion>
 *
 * @outputs
 *      <paths.pathClassificationBananaAct><COUNTRY>-<regionId>-<outputVersion>
 *
 * @author
 *      Fabricio Garcés - EcoCiencia
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

  // New years, classified with P04 (version currentCollectionVersion).
  newYears: [2000],
  currentCollectionVersion: 993,

  // Years taken from a previous stack. [] = none.
  previousCollectionYears: [],
  previousCollectionVersion: 1,
  previousCollectionPath: '',       // folder of the previous stack (must end with '/')

  yearsPreview: [2000],

  outputVersion: 992,

  // *** CAUTION *** true deletes the existing asset with the same name before exporting.
  overwrite: false
};


// =============================================================================
// 2. MODULES, ASSETS AND CONSTANTS
// =============================================================================

var paths = require('users/mapbiomasecuador/LULC:COLECCION4/05-modules/CollectionDirectories.js').paths;
var palette = require('users/mapbiomasecuador/LULC:MODULES/Palettes.js').get('EcuadorCol4');

// Folder of the P04 classifications.
// TODO: confirm it is the same as paths.pathPrelimiarClassificationBanana (used by P04).
var CURRENT_COLLECTION_PATH = 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION4/CROSS_CUTTING_THEMES/BANANA/STEP03-CLASSIFICATION/preliminar/';

var CLASS_VIS = { min: 0, max: palette.length - 1, palette: palette };


// =============================================================================
// 3. STACK
// =============================================================================

var region = ee.FeatureCollection(paths.pathRegionesBanana)
  .filter(ee.Filter.eq('region', PARAMS.regionId));

var regionMask = region
  .map(function (f) { return f.set('version', 1); })
  .reduceToImage(['version'], ee.Reducer.first());

// New years: one image per year, band 'classification_<year>'.
var newYearsImage = ee.Image.cat(PARAMS.newYears.map(function (year) {
  return ee.Image(CURRENT_COLLECTION_PATH + 'BANANA-' + PARAMS.country + '-' + PARAMS.regionId + '-' +
    year + '-' + PARAMS.currentCollectionVersion).updateMask(regionMask);
})).byte();

var stack = newYearsImage;

// Previous years; new years replace them if repeated.
if (PARAMS.previousCollectionYears.length > 0) {
  var previousBands = PARAMS.previousCollectionYears.map(function (year) {
    return 'classification_' + year;
  });

  stack = ee.Image(PARAMS.previousCollectionPath + PARAMS.country + '-' + PARAMS.regionId + '-' +
    PARAMS.previousCollectionVersion)
    .select(previousBands)
    .updateMask(regionMask)
    .byte()
    .addBands(newYearsImage, null, true);
}

stack = stack.set({
  regions: PARAMS.regionId.toString(),
  country: PARAMS.country,
  version: PARAMS.outputVersion,
  step: 'stack multiband',
  theme: 'Banana'
});

print('Stack', stack);


// =============================================================================
// 4. MAP
// =============================================================================

Map.addLayer(region.style({ fillColor: 'FF000000', color: 'FF0000' }), {}, 'Region ' + PARAMS.regionId, false);

PARAMS.yearsPreview.forEach(function (year) {
  Map.addLayer(stack.select('classification_' + year), CLASS_VIS, 'Stack ' + year);
});


// =============================================================================
// 5. EXPORT
// =============================================================================

var fileName = PARAMS.country + '-' + PARAMS.regionId + '-' + PARAMS.outputVersion;
var assetId = paths.pathClassificationBananaAct + fileName;   // path must end with '/'

if (PARAMS.overwrite) {
  try {
    ee.data.deleteAsset(assetId);
  } catch (error) {
    print('Nothing to delete: ' + assetId);
  }
}

Export.image.toAsset({
  image: stack.byte().reproject('EPSG:4326', null, 30),
  description: fileName,
  assetId: assetId,
  scale: 30,
  pyramidingPolicy: { '.default': 'mode' },
  maxPixels: 1e13,
  region: region.geometry().bounds()
});
