/**
 * @name
 *      P09-integration.js
 * 
 * @description
 *      Script to integrate assets for banana cross-cutting theme data.
 * 
 * @author
 *      Mapbiomas Ecuador Team
 * @theme
 *      Banana   
 * @version
 *      1.0.0
 * 
 * @Date
 *      10/14/2025
 */

var param = {
  
    country: 'ECUADOR',
    
    theme: 'BANANA',
    
    collection: '3.0',
    
    outputVersion: 1,
    
    source: 'EcoCiencia',
    
    region: 'ECUADOR',
    
    outputPath: 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION3/CROSS_CUTTING_THEMES/AGRICULTURE/STEP4_INTEGRATION',
    
  
    assets: [
      'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION3/CROSS_CUTTING_THEMES/BANANA/STEP3_CLASSIFICATION/clasificacion-ft/ECUADOR-40910-6',
      'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION3/CROSS_CUTTING_THEMES/BANANA/STEP3_CLASSIFICATION/clasificacion-ft/ECUADOR-40906-7',
      'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION3/CROSS_CUTTING_THEMES/BANANA/STEP3_CLASSIFICATION/clasificacion-ft/ECUADOR-40903-7'
    ],
  
    years: ee.List.sequence(1985, 2024).getInfo(),
    
    vis: {
      
        classification: {
          
            min: 27,
            max: 74,
            palette: ['#b5b5b5', '#be83f7']
            
        }
      
    },
    
};

// Load country boundary
var region = ee.FeatureCollection('projects/mapbiomas-ecuador/assets/AUXILIAR-DATA/VECTOR/COLLECTION-3/nivel_politico_1_ECU_col3');

// Create raster mask from country boundary
var region_raster = region
    .map(function(f) { return f.set('version', 1); })
    .reduceToImage(['version'], ee.Reducer.first());

// Load banana area mask
var banana_asset = 'projects/mapbiomas-ecuador/assets/AUXILIAR-DATA/VECTOR/COLLECTION-3/BANANO/Areas-banano-2018-2022';

// Create buffer around banana areas
var banana_mask = ee.FeatureCollection(banana_asset)
    .map(function(feature) { return feature.buffer(200).set('version', 1); })
    .reduceToImage(['version'], ee.Reducer.first());

// Display banana mask on map
Map.addLayer(banana_mask, {}, 'Banana Mask', false);

/**
 * Create integration
 */
var integration = ee.ImageCollection(param.assets)
    .mosaic()
    .updateMask(banana_mask)
    .set({
        version: param.outputVersion,
        collection: param.collection,
        country: param.country,
        source: param.source,
        theme: param.theme,
    })
    .updateMask(region_raster);

/**
 * Asset generation
 */
var outputName = 'ECUADOR-BANANA-' + param.outputVersion;

Export.image.toAsset({
    image: integration.byte(),
    description: outputName,
    assetId: param.outputPath + '/' + outputName,
    pyramidingPolicy: {
        '.default': 'mode'
    },
    scale: 30,
    maxPixels: 1e13
});

/**
 * Preview
 */
param.years.forEach(function(year) {
    var selector = 'classification_' + year;
    var outputName = param.region.toUpperCase() + '-' + year;
    var selected = integration.select(selector);

    Map.addLayer(selected, param.vis.classification, outputName, false);
});