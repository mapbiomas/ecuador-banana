/**
 * 
 * @name
 *      P03-random-samples.js
 * 
 * @description
 *      Script to obtain random samples for the banana cross-cutting theme.
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
 *  07/29/2025
 */

/**
 * Parameters
 */

var param = {
  country: 'ECUADOR',
  regionId: 40910,
  versionInput: 2,
  versionOutput: 999,
  yearsExport: [ 
      1985, //1986, 1987, 
      // 1989, 1990, 1991, //  1992, 
      // 1993, 1994, 1995, 
    //  1996, 
      1997, 1998, 1999, 2000, 
    //  2001, 2002, 2003, 2004, 
    //  2005, 2006, 2007, 2008, 
    //  2009, 2010, 2011, 2012, 
    //  2013, 2014, 2015, 2016, 
      // 2017, 2018, 2019, 2020,
    //  2021, 2022
      // 2021, 2022, 2023
    // 2024
    ],
  yearsPreview: [1985],
  samples: [
    1000,         // banana
    2000          // non-banana
  ],
  variables: [],
  drive: false,
  dirPath: require('users/mapbiomasecuador/LULC:COLECCION3/05-modules/CollectionDirectories.js').paths,
  palette: require('users/mapbiomas/modules:Palettes.js').get('classification2'),
};

var years = param.yearsExport;

// Load classification regions
var region = ee.FeatureCollection(param.dirPath.pathRegionesBanana)
    .filter(ee.Filter.eq('id_regionC', param.regionId));

var setVersion = function(item) { return item.set('version', 1); };
var regionRaster = region
    .map(setVersion)
    .reduceToImage(['version'], ee.Reducer.first());

var mosaics = ee.ImageCollection(param.dirPath.mosaicRaisgAct)
    .merge(ee.ImageCollection(param.dirPath.mosaicPacificoAct))
    .filterBounds(region);

Map.addLayer(region.style({ fillColor: "FF000000", color: "FF0000"}), {}, 'Region', false);

var stablePixelsName = 'ME-ECUADOR-' + param.regionId + '-' + param.versionInput;

var stablePixels = ee.Image(param.dirPath.pathStablePixelsBananaAct + stablePixelsName)
    .updateMask(regionRaster)
    .rename('reference');

// Terrain data
var dem = ee.Image('JAXA/ALOS/AW3D30_V1_1').select("AVE");
var slope = ee.Terrain.slope(dem).rename('slope');
var slppost = ee.Image('projects/mapbiomas-raisg/MOSAICOS/slppost2_30_v2').rename('slppost');
var shadeMask2 = ee.Image("projects/mapbiomas-raisg/MOSAICOS/shademask2_v2").rename('shade_mask2');

// Generate stratified random sample points
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
        classValues: [27, 74],
        classPoints: [param.samples[0], param.samples[1]]
    });

// Process each year
years.forEach(function(year) {
    var yearMosaic = mosaics.filter(ee.Filter.eq('year', year));
    
    if (year == 2022 || year == 2023 || year == 2024) {
        yearMosaic = yearMosaic.filterMetadata('satellite', 'equals', 'l8');
    }
    
    yearMosaic = yearMosaic.mosaic()
        .addBands(dem.rename('elevation'))
        .addBands(slope)
        .addBands(slppost)
        .addBands(shadeMask2)
        .updateMask(regionRaster);
    
    // Extract sample values from the mosaic
    var training = stablePixels
        .addBands(yearMosaic)
        .sampleRegions({
            collection: points,
            properties: ['reference'],
            scale: 30,
            geometries: true,
            tileScale: 2
        });
    
    training = training.map(function(feature) {
        return feature.set('year', year);
    });
    
    var filename = 'samples-' + param.country + '-' + param.regionId + '-' + year + '-p03-' + param.versionOutput;
    
    var hist = training.aggregate_histogram('reference');
    print('Samples ' + year + ' by ID:', hist);
    
    // Export to Earth Engine asset
    Export.table.toAsset(
        training,
        filename,
        param.dirPath.pathTrainingSamplesBananaAct + filename
    );
    
    // Export to Google Drive if enabled
    if (param.drive) {
        Export.table.toDrive({
            collection: training,
            description: 'DRIVE-' + filename,
            folder: 'BANANA-SAMPLES-EXPORTS',
            fileNamePrefix: filename,
            fileFormat: 'CSV'
        });
    }
    
    var pts = ee.FeatureCollection(training);
    Map.addLayer(pts, {}, 'Points ' + year);
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
    
    // False color composite
    Map.addLayer(yearMosaic, {
        'bands': ['nir_median', 'swir1_median', 'red_median'],
        'min': 0,
        'max': 5133,
        'gamma': 1.06
    }, 'Mosaic-' + year, false);
    
    // SAVI (Soil Adjusted Vegetation Index)
    Map.addLayer(yearMosaic, {
        'bands': ['savi_median'],
        'min': 10265,
        'max': 16656,
        'palette': ['ffeda0', 'fed976', 'feb24c', 'fd8d3c', 'f03b20', 'bd0026']
    }, 'SAVI-' + year, false);
});