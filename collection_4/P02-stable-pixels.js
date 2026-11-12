/**
 * @name
 *      P02-stable-pixels.js
 *
 * @description
 *      Banana cross-cutting theme - MapBiomas Ecuador Collection 4.
 *      Step 2: builds the stable-pixel map of one banana region, the
 *      reference from which the training samples of the banana
 *      classification are drawn.
 *
 *      1. Stable pixels of the previous collection: pixels with the same
 *         class in every year of the Collection 3 integrated map.
 *      2. The classes are grouped for the banana classification:
 *            14 (farming)  -> 21
 *            74 (banana)   -> 74
 *            other classes -> 27 (not banana)
 *      3. Stable pixels within 400 m of the known banana areas (2018-2022)
 *         are removed, so that unmapped banana is not sampled as another class.
 *      4. The banana ROIs reviewed in P01 (class 74) are added on top.
 *      5. Optionally, polygons drawn by the analyst add banana (inclusion)
 *         or remove pixels (exclusion).
 *
 * @usage
 *      1. Run P01-review-rois.js and export the banana ROIs (version `versionInput`).
 *      2. Set PARAMS, run and review "Stable pixels" over the mosaics.
 *      3. (Optional) Draw `inclusion` / `exclusion` polygons and run again.
 *      4. Start the export task from the Tasks tab.
 *
 * @inputs
 *      - Banana ROIs from P01: <paths.pathRoiStableBananaAct>ME-<COUNTRY>-<regionId>-<versionInput>
 *      - Collection 3 integrated map: paths.integrationCol3
 *      - Known banana areas 2018-2022 (BANANA_AREAS_ASSET)
 *      - Banana classification regions: paths.pathRegionesBanana (field 'region')
 *
 * @outputs
 *      <paths.pathStablePixelsBananaAct>ME-<COUNTRY>-<regionId>-<versionOutput>
 *      band 'stablePixels' with classes 21, 27 and 74; other pixels masked.
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

  // Banana classification region (field 'region').
  // Regions used: 40901, 40903, 40904, 40905, 40906, 40910.
  regionId: 40901,

  versionInput: 990,      // banana ROIs from P01
  versionOutput: 991,

  // Years whose mosaics are added to the map.
  yearsPreview: [1985, 1986, 1987, 1990, 2023, 2024, 2025],

  // Polygons drawn in the Code Editor (FeatureCollections), or null.
  polygons: {
    inclusion: null,   // e.g. inclusion -> pixels become banana (74)
    exclusion: null    // e.g. exclusion -> pixels are removed
  },

  // Class grouping of the stable pixels: 14 -> 21, 74 -> 74, others -> 27.
  remaps: {
    from: [3,  4,  5,  6,  9,  11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 23, 24, 25, 26, 29, 30, 31, 32, 33, 34, 35, 74],
    to:   [27, 27, 27, 27, 27, 27, 27, 27, 21, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 74]
  },

  // Distance (m) around the known banana areas where stable pixels are removed.
  bananaBuffer: 400,

  // Monthly Planet NICFI basemaps for visual review (requires NICFI access).
  planet: {
    activate: false,
    dates: [
      ['July 2024',      '2024-07-01', '2024-08-01'],
      ['August 2024',    '2024-08-01', '2024-09-01'],
      ['September 2024', '2024-09-01', '2024-10-01'],
      ['October 2024',   '2024-10-01', '2024-11-01'],
      ['November 2024',  '2024-11-01', '2024-12-01'],
      ['December 2024',  '2024-12-01', '2025-01-01']
    ]
  }
};


// =============================================================================
// 2. MODULES, ASSETS AND CONSTANTS
// =============================================================================

var paths = require('users/mapbiomasecuador/LULC:COLECCION4/05-modules/CollectionDirectories.js').paths;
var palette = require('users/mapbiomasecuador/LULC:MODULES/Palettes.js').get('EcuadorCol4');

var BANANA_AREAS_ASSET = 'projects/mapbiomas-ecuador/assets/AUXILIAR-DATA/VECTOR/COLLECTION-3/BANANO/Areas-banano-2018-2022';
var GRID_5KM_ASSET = 'projects/mapbiomas-raisg/DATOS_AUXILIARES/VECTORES/ECUADOR/grillaEcuador5km';
var NICFI_COLLECTION = 'projects/planet-nicfi/assets/basemaps/americas';

var BANANA = 74;

var CLASS_VIS = { min: 0, max: palette.length - 1, palette: palette };
var MOSAIC_VIS = { bands: ['nir_median', 'swir1_median', 'red_median'], min: 0, max: 5133, gamma: 1.06 };
var PLANET_VIS = { bands: ['R', 'G', 'B'], min: 350, max: 3000, gamma: 2.25 };


// =============================================================================
// 3. FUNCTIONS
// =============================================================================

/** Rasterizes a FeatureCollection with a constant value (masked outside). */
function toRaster(features, value) {
  return features
    .map(function (f) { return f.set('value', value); })
    .reduceToImage(['value'], ee.Reducer.first());
}

/**
 * Pixels with the same class in every band (year). Masked years are ignored.
 */
function getStablePixels(image) {
  var minimum = image.reduce(ee.Reducer.min());
  var maximum = image.reduce(ee.Reducer.max());
  return minimum.updateMask(minimum.eq(maximum));
}

/**
 * Inclusion polygons become banana (74); exclusion polygons are masked.
 */
function includeExcludeAreas(image, included, excluded) {
  var bandName = image.bandNames().get(0);

  if (included && included.size().getInfo() > 0) {
    image = ee.ImageCollection([image, toRaster(included, BANANA).rename([bandName])]).mosaic();
    print('Inclusion polygons applied');
  }

  if (excluded && excluded.size().getInfo() > 0) {
    image = image.updateMask(toRaster(excluded, 0).unmask(1));
    print('Exclusion polygons applied');
  }

  return ee.Image(image).byte();
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
// 4. STABLE PIXELS
// =============================================================================

var region = ee.FeatureCollection(paths.pathRegionesBanana)
  .filter(ee.Filter.eq('region', PARAMS.regionId));

var regionMask = toRaster(region, 1);

var previousCollection = ee.Image(paths.integrationCol3).updateMask(regionMask);

var bananaAreas = ee.FeatureCollection(BANANA_AREAS_ASSET);

// 1 in the region, masked within the buffer of the known banana areas.
var bananaBufferZone = toRaster(
  bananaAreas.map(function (f) { return f.buffer(PARAMS.bananaBuffer); }), 0
).updateMask(regionMask);

var analysisMask = ee.Image(1).updateMask(regionMask).blend(bananaBufferZone).selfMask();

// Banana ROIs reviewed in P01.
var bananaRois = ee.Image(paths.pathRoiStableBananaAct + 'ME-' + PARAMS.country + '-' +
  PARAMS.regionId + '-' + PARAMS.versionInput);

var stablePixels = getStablePixels(previousCollection)
  .remap(PARAMS.remaps.from, PARAMS.remaps.to)
  .multiply(analysisMask)
  .blend(bananaRois);

stablePixels = includeExcludeAreas(stablePixels, PARAMS.polygons.inclusion, PARAMS.polygons.exclusion);

stablePixels = stablePixels
  .updateMask(regionMask)
  .rename('stablePixels')
  .set({
    region: PARAMS.regionId,
    country: PARAMS.country,
    version: PARAMS.versionOutput,
    theme: 'Banana',
    step: 'Stable Pixels'
  });

print('Output image', stablePixels);


// =============================================================================
// 5. MAP
// =============================================================================

var mosaics = ee.ImageCollection(paths.mosaicRaisgAct)
  .merge(ee.ImageCollection(paths.mosaicPacificoAct))
  .filterBounds(region);

PARAMS.yearsPreview.forEach(function (year) {
  Map.addLayer(getYearMosaic(mosaics, year).updateMask(regionMask), MOSAIC_VIS, 'Mosaic ' + year, false);
});

if (PARAMS.planet.activate) {
  var nicfi = ee.ImageCollection(NICFI_COLLECTION).filterBounds(region);
  PARAMS.planet.dates.forEach(function (date) {
    var basemap = ee.Image(nicfi.filter(ee.Filter.date(date[1], date[2])).first());
    Map.addLayer(basemap.clip(region.geometry().bounds()), PLANET_VIS, 'Planet ' + date[0], false);
  });
}

Map.addLayer(
  ee.FeatureCollection(GRID_5KM_ASSET).style({ color: 'white', fillColor: '00000000' }),
  {}, '5 km grid', false
);
Map.addLayer(region.style({ fillColor: 'FF000000', color: 'FF0000' }), {}, 'Region ' + PARAMS.regionId, false);
Map.addLayer(bananaAreas, {}, 'Known banana areas 2018-2022');
Map.addLayer(stablePixels, CLASS_VIS, 'Stable pixels');


// =============================================================================
// 6. EXPORT
// =============================================================================

var outputName = 'ME-' + PARAMS.country + '-' + PARAMS.regionId + '-' + PARAMS.versionOutput;

Export.image.toAsset({
  image: stablePixels.byte().reproject('EPSG:4326', null, 30),
  description: outputName,
  assetId: paths.pathStablePixelsBananaAct + outputName,   // path must end with '/'
  scale: 30,
  pyramidingPolicy: { '.default': 'mode' },
  maxPixels: 1e13,
  region: region.geometry().bounds()
});
