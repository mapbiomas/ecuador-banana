/**
 * 
 * @name
 *      P06-pre-gapfill-banana.js
 * 
 * @description
 *      Script that performs pre gap filling for banana classification data
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
  versionInput: 2,
  versionOutput: 999,
  years: [1985, 2024],
  yearsPreview: [1985, 1986, 1988, 2023, 2024],
  exclusion: {  // List classes and years to exclude from the filter
    classes: [],  // List of classes to exclude in all years
    years: [],    // List of years to exclude with all classes
  },
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
var input = ee.Image(param.dirPath.pathClassificationBananaAct + '/' + param.country + '-' + param.regionId + '-' + param.versionInput)
    .unmask(27)
    .updateMask(regionRaster);

print('Input Image: ', input);

var fullBands = years.map(function(year) { return 'classification_' + year; });

// Fill missing bands in the image
var imgFillMissingBands = fillMissingBands(input, fullBands);

var inputImage = imgFillMissingBands.classification;

var fileName = param.country + '-' + param.regionId + '-' + param.versionOutput;

print('File name:', fileName);

// Export to asset
Export.image.toAsset({
    image: inputImage.byte().set({
        country: param.country,
        region: param.regionId,
        version: param.versionOutput,
        step: 'gapfill-1'
    }),
    description: fileName,
    assetId: param.dirPath.pathClassificationBananaFilterAct + '/' + fileName,
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
    
    // Display original classification
    Map.addLayer(inputImage, {
        bands: 'classification_' + year,
        min: 27,
        max: 74,
        palette: ['#b5b5b5', '#be83f7']
    }, 'ORG ' + year, false);
});

/**
 * Function to fill missing bands in a multitemporal image
 * @param {ee.Image} img - Input image with some bands
 * @param {Array} bands - List of expected band names
 * @returns {Object} Object containing classification and original images with all bands
 */
function fillMissingBands(img, bands) {
    var baseImage = img;
    var bandNames = ee.List(bands);
    var original = baseImage;
    var bandNameReg = baseImage.bandNames();
    
    // Identify missing bands
    var missingBands = bandNames.removeAll(bandNameReg);
    
    // Create images for missing bands with value 27
    var missingImages = ee.ImageCollection(
        ee.Algorithms.If(
            ee.Algorithms.IsEqual(missingBands.size(), 0),
            ee.ImageCollection([]),
            ee.ImageCollection(
                missingBands.map(function(band) {
                    var stringBand = ee.String(band);
                    var stringYear = stringBand.slice(-4);
                    return ee.Image(27).rename(stringBand).set('year', stringYear);
                })
            )
        )
    );
    
    if (missingImages.size().gt(0)) {
        print('Years without images:', missingImages.aggregate_array('year'));
    }
    
    // Get valid classification images
    var validImages = ee.ImageCollection(
        bandNameReg.map(function(bandName) {
            var stringYear = ee.String(bandName).slice(-4);
            return baseImage.select([bandName]).set('year', stringYear);
        })
    );
    
    // Merge valid and missing images into a single multiband image
    var classification_pre = missingImages
        .merge(validImages)
        .sort('year')
        .toBands()
        .updateMask(baseImage.select([bandNameReg.get(0)]));
    
    // Create masked version (only non-27 values)
    var classification = missingImages.merge(validImages)
        .map(function(image) {
            return image.updateMask(image.unmask().neq(27));
        })
        .sort('year')
        .toBands()
        .updateMask(baseImage.select([bandNameReg.get(0)]));
    
    return {
        classification: classification.rename(bandNames),
        original: classification_pre.rename(bandNames)
    };
}