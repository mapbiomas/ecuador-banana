/**
 * @name
 *      P09-integration.js
 *
 * @description
 *      Banana cross-cutting theme - MapBiomas Ecuador Collection 4.
 *      Step 9: integrates the filtered banana classifications of all banana
 *      regions into the national banana map.
 *
 *      1. Mosaics the final filtered image of each region (REGION_VERSIONS).
 *         Where regions overlap, the region listed LAST is kept.
 *      2. Keeps banana only within `bananaBuffer` meters of the known banana
 *         areas 2018-2022; elsewhere the pixel becomes 27 (not banana).
 *      3. Pixels of Ecuador with no value (including the pixels masked by
 *         the P08 gap fill) become 27; pixels outside Ecuador are masked.
 *      4. Exports the national image (one band per year).
 *
 * @usage
 *      1. Update REGION_VERSIONS with the final version of each region (P08).
 *      2. Set the output version, run, review the years and start the export task.
 *
 * @inputs
 *      <CLASSIFICATION_FT_PATH>ECUADOR-<regionId>-<version>  (one per region)
 *
 * @outputs
 *      <PARAMS.outputPath>/ECUADOR-BANANA-<outputVersion>
 *      bands 'classification_<year>': 74 = banana, 27 = not banana.
 *
 * @author
 *      Fabricio Garcés - EcoCiencia; MapBiomas Amazonía development team
 *
 * @version
 *      1.0.0 (2025-10-14)
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
  theme: 'BANANA',
  collection: '4.0',
  source: 'EcoCiencia',

  outputVersion: 1,
  outputPath: 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION4/CROSS_CUTTING_THEMES/BANANA/STEP04-INTEGRATION',

  // Banana is kept only within this distance (m) of the known banana areas.
  bananaBuffer: 200,

  // Years added to the map.
  yearsPreview: { first: 1985, last: 2025 }
};

// Final filtered version of each banana region (P08).
// Order matters where regions overlap: later regions are drawn on top.
var REGION_VERSIONS = [
  [40901, 9],
  [40902, 9],
  [40903, 9],
  [40904, 9]
];


// =============================================================================
// 2. ASSETS AND CONSTANTS
// =============================================================================

var CLASSIFICATION_FT_PATH = 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION4/CROSS_CUTTING_THEMES/BANANA/STEP03-CLASSIFICATION/classification-ft/';
var COUNTRY_ASSET = 'projects/mapbiomas-ecuador/assets/AUXILIAR-DATA/VECTOR/COLLECTION-4/nivel_politico_1_col4';
var BANANA_AREAS_ASSET = 'projects/mapbiomas-ecuador/assets/AUXILIAR-DATA/VECTOR/COLLECTION-3/BANANO/Areas-banano-2018-2022';

var OTHER = 27;

var BANANA_VIS = { min: OTHER, max: 74, palette: ['b5b5b5', 'be83f7'] };


// =============================================================================
// 3. INTEGRATION
// =============================================================================

var country = ee.FeatureCollection(COUNTRY_ASSET);

var countryMask = country
  .map(function (f) { return f.set('version', 1); })
  .reduceToImage(['version'], ee.Reducer.first());

// 1 within the buffer of the known banana areas, masked elsewhere.
var bananaZone = ee.FeatureCollection(BANANA_AREAS_ASSET)
  .map(function (f) { return f.buffer(PARAMS.bananaBuffer).set('version', 1); })
  .reduceToImage(['version'], ee.Reducer.first());

var assets = REGION_VERSIONS.map(function (item) {
  return CLASSIFICATION_FT_PATH + PARAMS.country + '-' + item[0] + '-' + item[1];
});

print('Regions integrated', assets);

var integration = ee.ImageCollection(assets)
  .mosaic()
  .updateMask(bananaZone)
  .unmask(OTHER)
  .updateMask(countryMask)
  .set({
    version: PARAMS.outputVersion,
    collection: PARAMS.collection,
    country: PARAMS.country,
    source: PARAMS.source,
    theme: PARAMS.theme,
    created: ee.Date(Date.now()).format('YYYY-MM-dd HH:mm:ss')
  });

print('Output image', integration);


// =============================================================================
// 4. EXPORT
// =============================================================================

var outputName = PARAMS.country + '-BANANA-' + PARAMS.outputVersion;

Export.image.toAsset({
  image: integration.byte(),
  description: outputName,
  assetId: PARAMS.outputPath + '/' + outputName,
  pyramidingPolicy: { '.default': 'mode' },
  region: country.geometry().bounds(),
  crs: 'EPSG:4326',
  scale: 30,
  maxPixels: 1e13
});


// =============================================================================
// 5. MAP
// =============================================================================

Map.addLayer(bananaZone, { palette: ['be83f7'] }, 'Known banana areas + ' + PARAMS.bananaBuffer + ' m', false);

for (var year = PARAMS.yearsPreview.first; year <= PARAMS.yearsPreview.last; year++) {
  Map.addLayer(integration.select('classification_' + year), BANANA_VIS, PARAMS.country + ' ' + year, false);
}
