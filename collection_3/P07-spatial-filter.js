/**
 * 
 * @name
 *      P07-spatial-filter.js
 * 
 * @description
 *      Script that applies spatial filter to banana classification data
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
 *  2025
 */

/**
 * Parameters
 */

var param = {
  country: 'ECUADOR',
  regionId: 40910,
  versionInput: 998,
  versionOutput: 997,
  years: [1985, 2024],
  yearsPreview: [2024],
  eightConnected: false,
  minConnectedPixels: 10,
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

// Load input classification image
var input = ee.Image(param.dirPath.pathClassificationBananaFilterAct + '/' + param.country + '-' + param.regionId + '-' + param.versionInput)
    .unmask(27)
    .updateMask(regionRaster);

// Calculate connected pixels for each band
var inputImage = connectPixels(input, param.eightConnected);

// Apply spatial filter
var filtered = applySpatialFilter(inputImage, param).updateMask(regionRaster);

// Add metadata
filtered = filtered.updateMask(regionRaster)
    .set('region', param.regionId)
    .set('country', param.country)
    .set('version', param.versionOutput)
    .set('description', 'spatial filter');

print('Spatial Filter Result:', filtered);

var fileName = param.country + '-' + param.regionId + '-' + param.versionOutput;

// Export image to asset
Export.image.toAsset({
    'image': filtered.byte(),
    'description': fileName,
    'assetId': param.dirPath.pathClassificationBananaFilterAct + '/' + fileName,
    'pyramidingPolicy': {
        '.default': 'mode'
    },
    'region': region.geometry().bounds(),
    'scale': 30,
    'maxPixels': 1e13
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
    
    // Display original classification
    Map.addLayer(input.reproject('EPSG:4326', null, 30), {
        bands: 'classification_' + year,
        min: 27,
        max: 74,
        palette: ['#b5b5b5', '#be83f7']
    }, 'Original ' + year, false);
    
    // Display filtered classification
    Map.addLayer(filtered.reproject('EPSG:4326', null, 30), {
        bands: 'classification_' + year,
        min: 27,
        max: 74,
        palette: ['#b5b5b5', '#be83f7']
    }, 'Filtered ' + year, false);
});

/**
 * Calculate connected pixel count for each band
 * @param {ee.Image} image - Input multiband image
 * @param {boolean} eightConnected - Use 8-connectivity (true) or 4-connectivity (false)
 * @returns {ee.Image} Image with added connected pixel bands
 */
function connectPixels(image, eightConnected) {
    var bandNames = image.bandNames();
    var connected = image.addBands(
        image
            .connectedPixelCount(500, eightConnected)
            .rename(bandNames.map(function(band) {
                return ee.String(band).cat('_connected');
            }))
    );
    
    return connected;
}

/**
 * Apply spatial filter to remove isolated pixels
 * @param {ee.Image} image - Image with classification and connected pixel bands
 * @param {Object} config - Configuration with minConnectedPixels parameter
 * @returns {ee.Image} Filtered image
 */
function applySpatialFilter(image, config) {
    var bandNames = image.bandNames();
    var output = ee.Image(0);
    var bands = [];
    
    years.forEach(function(year) {
        var inputImage = image.select('classification_' + year);
        var connected = image.select('classification_' + year + '_connected');
        
        // Calculate mode filter and mask pixels below threshold
        var modeFilter = inputImage
            .focal_mode(1, 'square', 'pixels')
            .mask(connected.lte(param.minConnectedPixels));
        
        // Blend original with filtered pixels
        var classification = inputImage.blend(modeFilter);
        
        output = output.addBands(classification);
        bands.push('classification_' + year);
    });
    
    return output.select(bands);
}