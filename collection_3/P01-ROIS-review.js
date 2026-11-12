/**
 * 
 * @name
 *      P01-ROIS-review.js 
 * 
 * @description
 *      Script for reviewing classification ROIs for the banana cross-cutting theme
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
 * Geometries Import
 */
var inclusion = /* color: #d63000 */ee.FeatureCollection(
        [ee.Feature(
            ee.Geometry.Polygon(
                [[[-79.62514308623585, -1.7427751157382088],
                  [-79.62540057830128, -1.7454346344281728],
                  [-79.6198215835503, -1.7460351703861328],
                  [-79.62153819731984, -1.7420029967050727],
                  [-79.62342647246632, -1.7423461607588797]]]),
            {
              "system:index": "0"
            })]),
    exclusion = /* color: #98ff00 */ee.FeatureCollection(
        [ee.Feature(
            ee.Geometry.Polygon(
                [[[-79.6333828323296, -1.7501960213924534],
                  [-79.62913421325001, -1.7507107652055303],
                  [-79.6290054672173, -1.7486517891055675],
                  [-79.63239577941212, -1.7484373122985328]]]),
            {
              "value": 1,
              "type": "exclusion",
              "system:index": "0"
            })]);
/**
 * Parameters
 */
var param = {
  country: 'ECUADOR',
  regionId: 40910, //40903, 40906, 40904, 40905, 40901, 40910
  versionOutput: 1,
  yearsPreview: [1985, 1986, 1987, 1990, 2023, 2024, 2025],
  polygons: [inclusion, exclusion],
  dirPath: require('users/mapbiomasecuador/LULC:COLECCION3/05-modules/CollectionDirectories.js').paths,
};

// Load classification regions
var region = ee.FeatureCollection(param.dirPath.pathRegionesBanana)
    .filter(ee.Filter.eq('id_regionC', param.regionId));

var setVersion = function(item) { return item.set('version', 1); };
var regionRaster = region
    .map(setVersion)
    .reduceToImage(['version'], ee.Reducer.first());

// Load mosaics
var mosaic = ee.ImageCollection(param.dirPath.mosaicRaisgAct)
    .merge(ee.ImageCollection(param.dirPath.mosaicPacificoAct))
    .filterBounds(region);

// Load ROIs generated for stable samples
var roi = ee.FeatureCollection(param.dirPath.pathRoiBananaAct);

var roiRaster = roi.map(setVersion)
    .reduceToImage(['version'], ee.Reducer.first())
    .rename('constant')
    .clip(region);

// Include or exclude geometries
roiRaster = includeExcludeAreas(roiRaster, param.polygons[0], param.polygons[1]);

// Display region on map
Map.addLayer(region.style({ fillColor: "FF000000", color: "FF0000"}), {}, 'Region', false);

// Display mosaics for preview years
param.yearsPreview.forEach(function(year) {
    var yearMosaic = mosaic.filter(ee.Filter.eq('year', year));
    if (year == 2022 || year == 2023 || year == 2024) {
        yearMosaic = yearMosaic.filterMetadata('satellite', 'equals', 'l8');
    } else if (year == 2025) {
        yearMosaic = mosaic.filter(ee.Filter.eq('year', 2024));
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
    
    // Display SAVI (Soil Adjusted Vegetation Index)
    Map.addLayer(yearMosaic, {
        'bands': ['savi_median'],
        'min': 10265,
        'max': 16656,
        'palette': ['ffeda0', 'fed976', 'feb24c', 'fd8d3c', 'f03b20', 'bd0026']
    }, 'SAVI-' + year, false);
});

// Remap ROI values (1 -> 74)
roiRaster = roiRaster.remap([1], [74]).rename('reference');

// Display ROI on map
Map.addLayer(roiRaster, {palette: 'fcff0022', opacity: 0.7}, 'ROI');

// Export as asset
var assetName = 'ME-ECUADOR-' + param.regionId + '-' + param.versionOutput;

Export.image.toAsset({
    image: roiRaster.byte().reproject('EPSG:4326', null, 30),
    description: assetName,
    assetId: param.dirPath.pathRoiStableBananaAct + assetName,
    scale: 30,
    pyramidingPolicy: {
        '.default': 'mode'
    },
    maxPixels: 1e13,
    region: region.geometry().bounds()
});

/**
 * Function to include or exclude areas using geometry polygons
 * @param {ee.Image} image - Input image to be masked
 * @param {ee.FeatureCollection} included - Polygons to include (add to the image)
 * @param {ee.FeatureCollection} excluded - Polygons to exclude (mask out from the image)
 * @returns {ee.Image} Image with included/excluded areas applied
 */
function includeExcludeAreas(image, included, excluded) {
    // Apply inclusion polygons (add areas to the image)
    if (included && included.size().getInfo() > 0) {
        print('Inclusion geometries applied');
        var includedAreas = included
            .map(function(item) { return item.set('version', 1); })
            .reduceToImage(['version'], ee.Reducer.first())
            .rename('constant')
            .byte();

        image = ee.ImageCollection([image, includedAreas]).mosaic().byte();
    }
    
    // Apply exclusion polygons (mask out areas from the image)
    if (excluded && excluded.size().getInfo() > 0) {
        print('Exclusion geometries applied');
        var excludedMask = excluded
            .map(function(item) { return item.set('mask_value', 0); })
            .reduceToImage(['mask_value'], ee.Reducer.first())
            .unmask(1);
        
        image = image.updateMask(excludedMask);
    }
    
    return image;
}