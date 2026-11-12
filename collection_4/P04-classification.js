/**
 * @name
 *      P04-classification.js
 *
 * @description
 *      Banana cross-cutting theme - MapBiomas Ecuador Collection 4.
 *      Step 4: Random Forest classification of banana (74) vs. not banana
 *      (27), year by year, for one banana region.
 *
 *      For each year:
 *        1. Builds the mosaic of the year with terrain variables and keeps
 *           the bands in `featureSpace`.
 *        2. Loads the samples of that year (P03) and, optionally, adds
 *           samples drawn inside polygons (one class per polygon).
 *        3. Trains a Random Forest and classifies the mosaic.
 *        4. Removes patches smaller than `minPatchSize` pixels (they take the
 *           most frequent class of their 3x3 neighborhood).
 *        5. Every class other than 74 becomes 27.
 *        6. Optionally, keeps banana only where its probability is at least
 *           `probabilityMap.minBananaProbability`.
 *        7. Exports the classification of the year.
 *
 * @usage
 *      1. Run P03-random-samples.js and export the samples (version `versionInput`).
 *      2. Set PARAMS, run and review the classification over the mosaic.
 *      3. (Optional) Draw polygons for extra samples and run again.
 *      4. Start the export tasks from the Tasks tab.
 *
 * @inputs
 *      <paths.pathTrainingSamplesBananaAct>samples-<COUNTRY>-<regionId>-<year>-p03-<versionInput>
 *
 * @outputs
 *      One image per year:
 *      <paths.pathPrelimiarClassificationBanana>/BANANA-<COUNTRY>-<regionId>-<year>-<versionOutput>
 *      band 'classification_<year>': 74 = banana, 27 = not banana.
 *
 * @author
 *      MapBiomas Ecuador Team - EcoCiencia
 *
 * @version
 *      1.0.0 (2025-09-08)
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

  versionInput: 992,                // samples from P03
  versionOutput: 993,

  years: [2000],                    // Years to classify
  yearsPreview: [2000],             // Years added to the map

  // Random Forest.
  trees: 120,
  variablesPerSplit: 1,

  // Patches smaller than this (in 30 m pixels) are replaced by their neighbors.
  minPatchSize: 20,

  // Extra samples drawn inside polygons drawn in the Code Editor:
  // polygon i gets points[i] samples of class classes[i].
  additionalSamples: {
    polygons: [],    // e.g. [id_74, id_27]
    classes: [],     // e.g. [74, 27]
    points: []       // e.g. [500, 1000]
  },

  // Variables used by the classifier. They must exist in the samples (P03).
  featureSpace: [
    // static variables
    'slope', 'slppost', 'elevation',
    // mosaic variables
    'savi_dry', 'ndvi_wet', 'ndvi_median', 'gcvi_dry', 'mndwi_median',
    'red_median', 'evi2_wet', 'swir1_wet', 'gcvi_median', 'ndvi_dry',
    'swir2_wet_qmo', 'red_wet_max', 'nir_median', 'cai_min', 'evi2_dry', 'cai_max'
  ],

  // Probability filter: banana is kept only where its probability is at
  // least `minBananaProbability`; elsewhere the pixel becomes 27.
  probabilityMap: {
    activate: false,
    minBananaProbability: 0.7,
    addToMap: true
  }
};


// =============================================================================
// 2. MODULES, ASSETS AND CONSTANTS
// =============================================================================

var paths = require('users/mapbiomasecuador/LULC:COLECCION4/05-modules/CollectionDirectories.js').paths;

var BANANA = 74;
var OTHER = 27;

var MOSAIC_VIS = { bands: ['nir_median', 'swir1_median', 'red_median'], min: 0, max: 5133, gamma: 1.06 };
var SAVI_VIS = {
  bands: ['savi_median'], min: 10265, max: 16656,
  palette: ['ffeda0', 'fed976', 'feb24c', 'fd8d3c', 'f03b20', 'bd0026']
};
var CLASSIFICATION_VIS = { min: OTHER, max: BANANA, palette: ['d6d4d3', 'b051d6'] };
var PROBABILITY_VIS = { min: 0, max: 1, palette: ['606060', '29ff7f', '6638c0', 'ff0000'] };

// Terrain variables. TODO: P03 (samples) uses the v2 versions of slppost and
// shademask2, while this script uses v3: confirm which one is correct and
// use the same in both scripts.
var dem = ee.Image('JAXA/ALOS/AW3D30_V1_1').select('AVE');

var TERRAIN = ee.Image.cat(
  dem.rename('elevation'),
  ee.Terrain.slope(dem).rename('slope'),
  ee.Image('projects/mapbiomas-raisg/MOSAICOS/slppost2_30_v3').rename('slppost'),
  ee.Image('projects/mapbiomas-raisg/MOSAICOS/shademask2_v3').rename('shade_mask2')
);


// =============================================================================
// 3. FUNCTIONS
// =============================================================================

/**
 * Mosaic of a year with terrain variables. From 2022 on, Landsat 8 is used.
 * TODO: no 2026 mosaic yet; the 2025 Landsat 9 mosaic is used instead.
 */
function getMosaic(mosaics, year, regionMask) {
  var yearMosaics;

  if (year === 2026) {
    yearMosaics = mosaics.filter(ee.Filter.eq('year', 2025)).filter(ee.Filter.eq('satellite', 'l9'));
  } else {
    yearMosaics = mosaics.filter(ee.Filter.eq('year', year));
    if (year >= 2022) {
      yearMosaics = yearMosaics.filter(ee.Filter.eq('satellite', 'l8'));
    }
  }

  return yearMosaics.mosaic().addBands(TERRAIN).updateMask(regionMask);
}

/**
 * Draws `points[i]` random samples of `classes[i]` inside `polygons[i]`.
 */
function sampleFromPolygons(image, options) {
  return ee.FeatureCollection(options.polygons.map(function (polygon, i) {
    return image.sample({
      numPixels: options.points[i],
      region: polygon.geometry(),
      scale: 30,
      projection: 'EPSG:4326',
      seed: 1,
      geometries: true,
      tileScale: 16
    }).map(function (item) { return item.set('reference', options.classes[i]); });
  })).flatten();
}

/**
 * Replaces patches smaller than `minSize` pixels with the most frequent
 * class of their 3x3 neighborhood.
 */
function removeSmallPatches(image, minSize) {
  var patchSize = image.int16().connectedPixelCount(100, true).reproject('EPSG:4326', null, 30);
  var neighborhood = image.focal_mode(1, 'square', 'pixels')
    .mask(patchSize.lt(minSize))
    .reproject('EPSG:4326', null, 30);
  return image.blend(neighborhood);
}


// =============================================================================
// 4. CLASSIFICATION, YEAR BY YEAR
// =============================================================================

Map.setOptions('SATELLITE');

var region = ee.FeatureCollection(paths.pathRegionesBanana)
  .filter(ee.Filter.eq('region', PARAMS.regionId));

var regionMask = region
  .map(function (f) { return f.set('version', 1); })
  .reduceToImage(['version'], ee.Reducer.first());

var mosaics = ee.ImageCollection(paths.mosaicRaisgAct)
  .merge(ee.ImageCollection(paths.mosaicPacificoAct))
  .filter(ee.Filter.eq('country', PARAMS.country))
  .filterBounds(region);

Map.addLayer(region.style({ fillColor: 'FF000000', color: 'FF0000' }), {}, 'Region ' + PARAMS.regionId, false);

PARAMS.years.forEach(function (year) {
  var bandName = 'classification_' + year;

  var yearMosaic = getMosaic(mosaics, year, regionMask);
  var features = PARAMS.featureSpace.length > 0 ? yearMosaic.select(PARAMS.featureSpace) : yearMosaic;
  var bands = features.bandNames();

  // Samples.
  var samples = ee.FeatureCollection(paths.pathTrainingSamplesBananaAct + 'samples-' + PARAMS.country + '-' +
    PARAMS.regionId + '-' + year + '-p03-' + PARAMS.versionInput);

  if (PARAMS.additionalSamples.polygons.length > 0) {
    samples = samples.merge(sampleFromPolygons(features, PARAMS.additionalSamples));
  }

  // A Random Forest needs at least two classes.
  var nClasses = samples.aggregate_array('reference').distinct().size().getInfo();
  if (nClasses < 2) {
    print('WARNING: ' + year + ' has fewer than 2 classes in the samples. Year skipped.');
    return;
  }

  // Classify, remove small patches and keep only banana / not banana.
  var classifier = ee.Classifier.smileRandomForest({
    numberOfTrees: PARAMS.trees,
    variablesPerSplit: PARAMS.variablesPerSplit
  }).train(samples, 'reference', bands);

  var classified = removeSmallPatches(features.classify(classifier), PARAMS.minPatchSize)
    .rename(bandName);

  classified = classified.where(classified.neq(BANANA), OTHER);

  // Probability filter.
  var bananaProbability;

  if (PARAMS.probabilityMap.activate) {
    // The probability array is ordered by class value (27, 74, ...).
    var classIds = samples.aggregate_array('reference').distinct().sort().getInfo();
    var names = classIds.map(function (id) { return 'Id_' + id; });

    bananaProbability = features
      .classify(classifier.setOutputMode('MULTIPROBABILITY'))
      .arrayFlatten([names])
      .select('Id_' + BANANA);

    classified = classified.where(bananaProbability.lt(PARAMS.probabilityMap.minBananaProbability), OTHER);
  }

  classified = classified.set({
    country: PARAMS.country,
    region: PARAMS.regionId,
    version: PARAMS.versionOutput
  });

  print('Output image ' + year, classified);

  // Export.
  var fileName = 'BANANA-' + PARAMS.country + '-' + PARAMS.regionId + '-' + year + '-' + PARAMS.versionOutput;

  Export.image.toAsset({
    image: classified,
    description: fileName,
    assetId: paths.pathPrelimiarClassificationBanana + '/' + fileName,   // path without a trailing '/'
    pyramidingPolicy: { '.default': 'mode' },
    region: region.geometry().bounds(),
    scale: 30,
    crs: 'EPSG:4326',
    maxPixels: 1e13
  });

  // Map: mosaic, SAVI, probability, classification and samples.
  if (PARAMS.yearsPreview.indexOf(year) > -1) {
    Map.addLayer(yearMosaic, MOSAIC_VIS, 'Mosaic ' + year);
    Map.addLayer(yearMosaic, SAVI_VIS, 'SAVI ' + year, false);

    if (PARAMS.probabilityMap.activate && PARAMS.probabilityMap.addToMap) {
      Map.addLayer(bananaProbability, PROBABILITY_VIS, 'Banana probability ' + year, false);
    }

    Map.addLayer(classified.reproject('EPSG:4326', null, 30), CLASSIFICATION_VIS, 'Classification ' + year);

    var styledSamples = samples.map(function (feature) {
      var color = ee.Algorithms.If(feature.getNumber('reference').eq(BANANA), 'purple', 'gray');
      return feature.set('style', { color: color, pointSize: 5 });
    });
    Map.addLayer(styledSamples.style({ styleProperty: 'style' }), {}, 'Samples ' + year, false);
  }
});
