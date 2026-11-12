/**
 * @name
 *      P01-review-rois.js
 *
 * @description
 *      Banana cross-cutting theme - MapBiomas Ecuador Collection 4.
 *      Step 1: review the banana ROIs (regions of interest) of one
 *      classification region and export them as the reference map used to
 *      draw training samples.
 *
 *      1. Loads the banana ROI polygons and converts them to a raster
 *         (1 = banana) inside the region.
 *      2. Optionally edits them with polygons drawn by the analyst:
 *           - inclusion: areas added as banana;
 *           - exclusion: areas removed.
 *      3. Assigns the banana class ID (74) and exports the result.
 *
 *      The mosaics (false color and SAVI) of the preview years are added to
 *      the map to check that the ROIs fall on banana plantations.
 *
 * @usage
 *      1. Set PARAMS (region and output version).
 *      2. (Optional) In the Code Editor, draw two geometry layers named
 *         `inclusion` and `exclusion` (as FeatureCollections) and set
 *         `polygons: { inclusion: inclusion, exclusion: exclusion }`.
 *      3. Run, review the layer "Banana ROI" over the mosaics and start the
 *         export task from the Tasks tab.
 *
 * @inputs
 *      - Banana ROI polygons: paths.pathRoiBananaAct
 *      - Banana classification regions: paths.pathRegionesBanana (field 'region')
 *      - Annual mosaics (LULC step 1)
 *
 * @outputs
 *      <paths.pathRoiStableBananaAct>ME-<COUNTRY>-<regionId>-<versionOutput>
 *      band 'reference' = 74 (banana); other pixels masked.
 *
 * @author
 *      RAISG Development Team; MapBiomas Ecuador - EcoCiencia
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

  // Banana classification region (field 'region').
  // Regions used: 40901, 40903, 40904, 40905, 40906, 40910.
  regionId: 40901,

  versionOutput: 990,

  // Years whose mosaics are added to the map.
  yearsPreview: [1985, 1986, 1987, 1990, 2023, 2024, 2025],

  // Polygons drawn in the Code Editor (FeatureCollections), or null.
  polygons: {
    inclusion: null,   // e.g. inclusion
    exclusion: null    // e.g. exclusion
  }
};


// =============================================================================
// 2. MODULES AND CONSTANTS
// =============================================================================

var paths = require('users/mapbiomasecuador/LULC:COLECCION4/05-modules/CollectionDirectories.js').paths;

var BANANA = 74;

var MOSAIC_VIS = { bands: ['nir_median', 'swir1_median', 'red_median'], min: 0, max: 5133, gamma: 1.06 };
var SAVI_VIS = {
  bands: ['savi_median'], min: 10265, max: 16656,
  palette: ['ffeda0', 'fed976', 'feb24c', 'fd8d3c', 'f03b20', 'bd0026']
};


// =============================================================================
// 3. FUNCTIONS
// =============================================================================

/** Rasterizes a FeatureCollection: 1 inside the polygons, masked outside. */
function toRaster(features) {
  return features
    .map(function (f) { return f.set('version', 1); })
    .reduceToImage(['version'], ee.Reducer.first())
    .rename('constant');
}

/**
 * Adds the inclusion polygons to the image (value 1) and masks the
 * exclusion polygons.
 *
 * @param {ee.Image} image
 * @param {ee.FeatureCollection} included  null or polygons to add
 * @param {ee.FeatureCollection} excluded  null or polygons to remove
 * @returns {ee.Image}
 */
function includeExcludeAreas(image, included, excluded) {
  if (included && included.size().getInfo() > 0) {
    image = ee.ImageCollection([image, toRaster(included).byte()]).mosaic().byte();
    print('Inclusion polygons applied');
  }

  if (excluded && excluded.size().getInfo() > 0) {
    var keep = toRaster(excluded).multiply(0).unmask(1);
    image = image.updateMask(keep);
    print('Exclusion polygons applied');
  }

  return image;
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
// 4. BANANA ROI
// =============================================================================

var region = ee.FeatureCollection(paths.pathRegionesBanana)
  .filter(ee.Filter.eq('region', PARAMS.regionId));

var regionMask = toRaster(region);

// ROI polygons as raster (1 = banana), inside the region.
var roi = toRaster(ee.FeatureCollection(paths.pathRoiBananaAct)).clip(region);

roi = includeExcludeAreas(roi, PARAMS.polygons.inclusion, PARAMS.polygons.exclusion);

roi = roi.remap([1], [BANANA])
  .rename('reference')
  .updateMask(regionMask)
  .set({
    region: PARAMS.regionId,
    country: PARAMS.country,
    version: PARAMS.versionOutput,
    theme: 'Banana',
    step: 'Roi Banana'
  });

print('Output image', roi);


// =============================================================================
// 5. MAP
// =============================================================================

var mosaics = ee.ImageCollection(paths.mosaicRaisgAct)
  .merge(ee.ImageCollection(paths.mosaicPacificoAct))
  .filterBounds(region);

Map.addLayer(region.style({ fillColor: 'FF000000', color: 'FF0000' }), {}, 'Region ' + PARAMS.regionId, false);

// For each preview year: false-color mosaic and SAVI.
PARAMS.yearsPreview.forEach(function (year) {
  var yearMosaic = getYearMosaic(mosaics, year).updateMask(regionMask);
  Map.addLayer(yearMosaic, MOSAIC_VIS, 'Mosaic ' + year, false);
  Map.addLayer(yearMosaic, SAVI_VIS, 'SAVI ' + year, false);
});

Map.addLayer(roi, { palette: 'fcff0022', opacity: 0.7 }, 'Banana ROI');


// =============================================================================
// 6. EXPORT
// =============================================================================

var assetName = 'ME-' + PARAMS.country + '-' + PARAMS.regionId + '-' + PARAMS.versionOutput;

Export.image.toAsset({
  image: roi.byte().reproject('EPSG:4326', null, 30),
  description: assetName,
  assetId: paths.pathRoiStableBananaAct + assetName,   // path must end with '/'
  scale: 30,
  pyramidingPolicy: { '.default': 'mode' },
  maxPixels: 1e13,
  region: region.geometry().bounds()
});
