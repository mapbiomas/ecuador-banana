/**
 * 
 * @name
 *      P05-stack-multiband.js
 * 
 * @description
 *      Script that merges banana classification data
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
 * Parameters
 */

var param = {
  country: 'ECUADOR',
  regionId: 40910,
  versionInput: 1,
  versionOutput: 999,
  years: [1985, 2024],
  yearsPreview: [2021, 2023],
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

var years = ee.List.sequence(param.years[0], param.years[1]).getInfo();

var bands = years.map(function(year) { return 'classification_' + year; });

// Create a no-data image with value 27 for all bands
var noDataImages = years.map(function(year) { return ee.Image(27); });
var noDataImage = ee.ImageCollection(noDataImages).toBands().rename(bands);

print('No-data image:', noDataImage);

// Load classification collection
var collection = ee.ImageCollection(param.dirPath.pathPrelimiarClassificationBanana)
    .filterMetadata('region', 'equals', param.regionId)
    .filterMetadata('version', 'equals', param.versionInput)
    .toBands();

var originalBands = collection.bandNames();

// Extract year from band name (last 19 characters contain 'classification_YYYY')
var updatedBands = originalBands
    .map(function(band) { return ee.String(band).slice(-19); });

// Rename bands and clip to region
var input = collection.select(originalBands, updatedBands);

var output = input
    .clip(region)
    .byte()
    .set({
        country: param.country,
        region: param.regionId,
        version: param.versionOutput,
        step: 'stack'
    });

print('Output image:', output);

/**
 * Export stable pixels
 * Display results
 */
var output_name = param.country + '-' + param.regionId + '-' + param.versionOutput;

Export.image.toAsset({
    image: output,
    description: output_name,
    assetId: param.dirPath.pathClassificationBananaAct + output_name,
    scale: 30,
    pyramidingPolicy: { '.default': 'mode' },
    maxPixels: 1e13,
    region: region.geometry().bounds()
});

/**
 * Visualization of preview years
 */
param.yearsPreview.forEach(function(year) {
    var yearMosaic = mosaics.filter(ee.Filter.eq('year', year));
    
    if (year == 2022 || year == 2023 || year == 2024) {
        yearMosaic = yearMosaic.filterMetadata('satellite', 'equals', 'l8');
    } else if (year == 2025) {
        yearMosaic = mosaics.filter(ee.Filter.eq('year', 2024));
        yearMosaic = yearMosaic.filterMetadata('satellite', 'equals', 'l9');
    }
    
    yearMosaic = yearMosaic.mosaic().updateMask(regionRaster);
    
    // Display false color composite
    Map.addLayer(yearMosaic, {
        'bands': ['nir_median', 'swir1_median', 'red_median'],
        'min': 0,
        'max': 5133,
        'gamma': 1.06
    }, 'Mosaic-' + year, false);
    
    // Display classification stack result
    Map.addLayer(output, {
        bands: 'classification_' + year,
        min: 27,
        max: 74,
        palette: ['#b5b5b5', '#be83f7']
    }, 'STACK ' + year);
});