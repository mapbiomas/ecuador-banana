/**
 * 
 * @name
 *      P04-classification.js
 * 
 * @description
 *      Script to classify the banana cross-cutting theme year by year.
 * 
 * @authors
 *      Mapbiomas Ecuador Team
 * 
 * @theme
 *      Banana
 *
 * @version
 *  1.0.0
 *
 * @Date
 *  09/08/2025
 */


/**
 * Geometries Import
 */
var id_74 = /* color: #d63000 */ee.FeatureCollection([]),
    id_27 = /* color: #98ff00 */ee.FeatureCollection(
        [ee.Feature(
            ee.Geometry.Polygon(
                [[[-79.75802674956131, -1.9268107594045676],
                  [-79.76798310942459, -1.9273254522815064],
                  [-79.76768270201492, -1.9326010452923066],
                  [-79.75811258024979, -1.933716209197517]]]),
            {
              "id": 27,
              "system:index": "0"
            })]);
/**
 * Parameters
 */
var param = {
  country: 'ECUADOR',
  regionId: 40910,
  versionInput: 3,
  versionOutput: 1,
  trees: 120,
  years: [2024],
  yearsPreview: [2024],
  additionalSamples: {
    polygons: [/*id_74, id_27*/],
    classes: [/*74, 27*/], 
    points: [/*500, 1000*/] 
  },

  featureSpace: [
    /* static variables */
    'slope',
    'slppost',
    'elevation',
    /* dynamic variables */
    'savi_dry',
    'ndvi_wet',
    'ndvi_median',
    'gcvi_dry',
    'mndwi_median',
    'red_median',
    'evi2_wet',
    'swir1_wet',
    'gcvi_median',
    'ndvi_dry',
    'swir2_wet_qmo',
    'red_wet_max',
    'nir_median',
    'cai_min',
    'evi2_dry',
    'cai_max',
  ],
  
  probabilityMap: {
    activate: false,
    classesToMap: ['74', '27'],
    addToMap: true,
    probabilityThreshold: 0.3,
  },
  drive: false,
  dirPath: require('users/mapbiomasecuador/LULC:COLECCION3/05-modules/CollectionDirectories.js').paths,
  palette: require('users/mapbiomas/modules:Palettes.js').get('classification2'),
};

// Load classification regions
var region = ee.FeatureCollection(param.dirPath.pathRegionesBanana)
    .filter(ee.Filter.eq('id_regionC', param.regionId));

var setVersion = function(item) { return item.set('version', 1); };
var regionRaster = region
    .map(setVersion)
    .reduceToImage(['version'], ee.Reducer.first());

// Load mosaics
var mosaics = ee.ImageCollection(param.dirPath.mosaicRaisgAct)
    .merge(ee.ImageCollection(param.dirPath.mosaicPacificoAct))
    .filterBounds(region);

// Add region to map
Map.addLayer(region.style({ fillColor: "FF000000", color: "FF0000"}), {}, 'Region', false);

// Load training samples
ee.List(param.years).evaluate(function(years) {
  var classified = ee.Image(27).updateMask(regionRaster);
  
  years.forEach(function(year) {
    var yearMosaic = getMosaic(mosaics, year);
    var selected;
    
    if (param.featureSpace && param.featureSpace.length > 0) {
      selected = yearMosaic.select(param.featureSpace).updateMask(regionRaster);
    } else {
      selected = yearMosaic;
    }
    
    var bands = selected.bandNames();
    var nBands = bands.size();
    
    var assetId = param.dirPath.pathTrainingSamplesBananaAct + 'samples-' + param.country + '-' + param.regionId + '-' + year + '-p03-' + param.versionInput;
    
    var trainingSamples = ee.FeatureCollection(
      ee.Algorithms.If(
        ee.Algorithms.IsEqual(nBands, 0),
        null,
        ee.FeatureCollection(assetId)
      )
    );
    
    // Get the number of classes in samples
    var nClassSamples = trainingSamples
      .reduceColumns(ee.Reducer.toList(), ['reference'])
      .get('list');
    
    nClassSamples = ee.List(nClassSamples).reduce(ee.Reducer.countDistinct());
    
    // Add additional samples if provided
    if (param.additionalSamples.polygons.length > 0) {
      var newSamples = resampleCover(selected, param.additionalSamples);
      trainingSamples = trainingSamples.merge(newSamples);
    }
    
    // Classifier
    var classifier = ee.Classifier.smileRandomForest({
      numberOfTrees: param.trees,
      variablesPerSplit: 1
    });
    
    classifier = ee.Classifier(
      ee.Algorithms.If(
        ee.Algorithms.IsEqual(nBands, 0),
        null,
        ee.Algorithms.If(
          ee.Algorithms.IsEqual(nClassSamples, 1),
          null,
          classifier.train(trainingSamples, 'reference', bands)
        )
      )
    );
    
    var name = 'classification_' + year;
    
    classified = ee.Image(
      ee.Algorithms.If(
        ee.Algorithms.IsEqual(nBands, 0),
        classified.addBands(ee.Image().updateMask(regionRaster).rename(name)),
        ee.Algorithms.If(
          ee.Algorithms.IsEqual(nClassSamples, 1),
          classified.addBands(ee.Image().updateMask(regionRaster).rename(name)),
          classified.addBands(
            spatialFilter(selected.classify(classifier), 20)
              .select(['classification'], [name])
          )
        )
      )
    );
    
    classified = classified
      .where(classified.neq(74), 27)
      .where(classified.eq(74), 74);
    
    // Probability map if enabled
    if (param.probabilityMap.activate) {
      print('Probability map activated');
      var probabilityClassifier = classifier.setOutputMode('MULTIPROBABILITY');
      var probClassification = selected.classify(probabilityClassifier);
      var classIds = param.probabilityMap.classesToMap;
      var classId = classIds[0];
      var probabilities = probClassification.arrayFlatten([classIds]).select(classId);
      
      if (param.probabilityMap.addToMap) {
        Map.addLayer(probabilities, {
          "opacity": 1,
          "bands": ['74'],
          "palette": ["606060", "29ff7f", "6638c0", "ff0000"]
        }, 'Probability ' + year, false);
      }
      
      var thresholdValue = param.probabilityMap.probabilityThreshold;
      var probabilityMask = probabilities.lte(thresholdValue);
      classified = classified.multiply(ee.Image(0)).add(ee.Image(27)).blend(classified.mask(probabilityMask));
    }
    
    classified = classified
      .slice(1)
      .set({
        country: param.country,
        region: param.regionId,
        version: param.versionOutput,
      });
    
    print('Output Image ' + year, classified);
    
    // Export to asset
    Export.image.toAsset({
      image: classified,
      description: 'BANANA-' + param.country + '-' + param.regionId + '-' + param.versionOutput,
      assetId: param.dirPath.pathPrelimiarClassificationBanana + '/BANANA-' + param.country + '-' + param.regionId + '-' + param.versionOutput,
      pyramidingPolicy: {
        '.default': 'mode'
      },
      region: region.geometry().bounds(),
      scale: 30,
      crs: 'EPSG:4326',
      maxPixels: 1e13
    });
    
    // Visualize mosaic
    Map.addLayer(yearMosaic, {
      'bands': ['nir_median', 'swir1_median', 'red_median'],
      'min': 0,
      'max': 5133,
      'gamma': 1.06
    }, 'Mosaic-' + year, true);
    
    // Visualize SAVI
    Map.addLayer(yearMosaic, {
      'bands': ['savi_median'],
      'min': 10265,
      'max': 16656,
      'palette': ['ffeda0', 'fed976', 'feb24c', 'fd8d3c', 'f03b20', 'bd0026']
    }, 'SAVI-' + year, false);
    
    // Visualize classification
    Map.addLayer(classified.reproject('EPSG:4326', null, 30), {
      min: 27,
      max: 74,
      palette: ['#d6d4d3', '#b051d6']
    }, 'Classification ' + year);
    
    // Visualize training samples
    var styledSamples = trainingSamples.map(function(feat) {
      var reference = feat.getNumber('reference');
      var color = ee.Algorithms.If(
        reference.eq(74), 'red',
        ee.Algorithms.If(reference.eq(27), 'purple', 'gray')
      );
      return feat.set('style', { color: color, pointSize: 2 });
    });
    
    Map.addLayer(styledSamples.style({styleProperty: 'style'}), {}, 'Samples ' + year, false);
  });
});

/**
 * Get mosaic for a specific year with terrain bands
 */
function getMosaic(mosaicCollection, year) {
  // Terrain data
  var dem = ee.Image('JAXA/ALOS/AW3D30_V1_1').select("AVE");
  var slope = ee.Terrain.slope(dem).rename('slope');
  var slppost = ee.Image('projects/mapbiomas-raisg/MOSAICOS/slppost2_30_v3').rename('slppost');
  var shadeMask2 = ee.Image("projects/mapbiomas-raisg/MOSAICOS/shademask2_v3").rename('shade_mask2');
  
  var yearMosaic = mosaicCollection.filter(ee.Filter.eq('year', year));
  
  if (year == 2022 || year == 2023 || year == 2024) {
    yearMosaic = yearMosaic.filterMetadata('satellite', 'equals', 'l8');
  } else if (year == 2025) {
    yearMosaic = mosaicCollection.filter(ee.Filter.eq('year', 2024));
    yearMosaic = yearMosaic.filterMetadata('satellite', 'equals', 'l9');
  }
  
  yearMosaic = yearMosaic.mosaic()
    .addBands(dem.rename('elevation'))
    .addBands(slope)
    .addBands(slppost)
    .addBands(shadeMask2)
    .updateMask(regionRaster);
  
  return yearMosaic;
}

/**
 * Extract additional samples from polygons
 */
function resampleCover(mosaic, additionalSamples) {
  var polygons = additionalSamples.polygons,
      classIds = additionalSamples.classes,
      points = additionalSamples.points,
      newSamples = [];
  
  polygons.forEach(function(polygon, i) {
    var newSample = mosaic.sample({
      numPixels: points[i],
      region: polygon.geometry(),
      scale: 30,
      projection: 'EPSG:4326',
      seed: 1,
      geometries: true,
      tileScale: 16
    })
    .map(function(item) { return item.set('reference', classIds[i]); });
    
    newSamples.push(newSample);
  });
  
  return ee.FeatureCollection(newSamples).flatten();
}

/**
 * Apply spatial filter to classification
 */
function spatialFilter(image, minMappingUnit) {
  // Placeholder for spatial filter logic
  // Currently returns original image
  return image;
}

/**
 * Remap image using polygons
 */
function remapWithPolygons(image, polygons) {
  if (polygons.length > 0) {
    polygons.forEach(function(polygon) {
      var excluded = polygon.map(function(layer) {
        var area = image.clip(layer);
        
        var from = ee.String(layer.get('from'))
          .split(',')
          .map(function(item) { return ee.Number.parse(item); });
        
        var to = ee.String(layer.get('to'))
          .split(',')
          .map(function(item) { return ee.Number.parse(item); });
        
        return area.remap(from, to);
      });
      
      excluded = ee.ImageCollection(excluded).mosaic();
      image = excluded.unmask(image).rename('reference');
      image = image.mask(image.neq(0));
    });
  }
  
  return image;
}