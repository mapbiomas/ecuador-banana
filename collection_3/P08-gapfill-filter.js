/**
 * 
 * @name
 *      P08-gapfill-filter.js
 * 
 * @description
 *      Script that performs gap filling for banana classification data
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
  versionInput: 997,
  versionOutput: 996,
  fillOrder: 't0tn_tnt0', // 't0tn_tnt0', 'tnt0_t0tn'
  years: [1985, 2024],
  yearsPreview: [1985, 1986, 1996, 1988, 2015, 2023, 2024],
  exclusion: {  // List classes and years to exclude from the filter
    classes: [],  // List of classes to exclude in all years
    years: [],    // List of years to exclude with all classes
  },
  plot: {
    plotGraph: true,  // true to print graph, false to not print
    classGraph: [74], // Class to plot in console (original and filtered)
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
var input = ee.Image(param.dirPath.pathClassificationBananaFilterAct + '/' + param.country + '-' + param.regionId + '-' + param.versionInput)
    .unmask(27)
    .updateMask(regionRaster);

print('Input Image: ', input);

var fullBands = years.map(function(year) { return 'classification_' + year; });

var imgFillMissingBands = fillMissingBands(input, fullBands);

var inputImage = imgFillMissingBands.classification;

// Apply exclusion mask
var yearsExcludeImage = inputImage;
inputImage = maskExclusion(param.exclusion, inputImage);

// Create mask for pixels with at least 10 years of class 74
var mask74 = createMask74(inputImage, 10);

// Apply mask before gapfill
var filledWithMask = inputImage.where(mask74, inputImage);

var filled;
if (param.fillOrder === 't0tn_tnt0') {
    filled = forward_fill(filledWithMask).updateMask(mask74);
} else if (param.fillOrder === 'tnt0_t0tn') {
    filled = backward_fill(filledWithMask).updateMask(mask74);
}

print('RESULT:', filled);

var fileName = param.country + '-' + param.regionId + '-' + param.versionOutput;

// Export image to asset
Export.image.toAsset({
    image: filled.byte().set({
        country: param.country,
        region: param.regionId,
        version: param.versionOutput,
        step: 'gapfill'
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
    }, 'Original ' + year, false);
    
    // Display gap-filled classification
    Map.addLayer(filled, {
        bands: 'classification_' + year,
        min: 27,
        max: 74,
        palette: ['#b5b5b5', '#be83f7']
    }, 'Gapfill ' + year, false);
});

/**
 * Plot graphs for selected classes
 */
if (param.plot.plotGraph) {
    print('Note: The following graphs are reference only.',
          'To generate them, Landsat data was resampled from 30m to 250m,',
          'so they should be used with caution');
    
    var bands = ee.List.sequence(1985, 2024).getInfo();
    
    param.plot.classGraph.forEach(function(classId) {
        print('Graph - Statistics - Filtered - Class ' + classId,
            ui.Chart.image.regions({
                image: filled.eq(classId).multiply(6.25).selfMask(),
                regions: region.geometry().bounds(),
                reducer: ee.Reducer.sum(),
                scale: 250,
                seriesProperty: 'system:id',
                xLabels: bands
            })
            .setChartType('LineChart')
            .setOptions({
                title: 'Class ' + classId + ' - Filtered (resampled to 250m)',
                hAxis: {
                    title: 'Period',
                    titleTextStyle: {italic: false, bold: true},
                },
                vAxis: {
                    title: 'Area (ha)',
                    titleTextStyle: {italic: false, bold: true}
                },
                colors: ['#be83f7'],
                lineSize: 3
            })
        );
    });
}

/**
 * Fill missing bands in a multitemporal image
 */
function fillMissingBands(img, bands) {
    var baseImage = img;
    var bandNames = ee.List(bands);
    var original = baseImage;
    var bandNameReg = baseImage.bandNames();
    
    var missingBands = bandNames.removeAll(bandNameReg);
    
    // Set pixel value 27 for mask areas
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
    
    if (missingImages.size().gte(1)) {
        print('Years without images:', missingImages.aggregate_array('year'));
    }
    
    // Get valid classification images
    var validImages = ee.ImageCollection(
        bandNameReg.map(function(bandName) {
            var stringYear = ee.String(bandName).slice(-4);
            return baseImage.select([bandName]).set('year', stringYear);
        })
    );
    
    // Merge valid and missing images (unmasked version)
    var classification_pre = missingImages
        .merge(validImages)
        .sort('year')
        .toBands()
        .updateMask(baseImage.select([bandNameReg.get(0)]));
    
    // Merge valid and missing images (masked version - only non-27 values)
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

/**
 * Apply exclusion mask for years and classes
 */
function maskExclusion(exclusion, inputImage) {
    // Exclude years
    if (exclusion.years.length > 0) {
        var yearMaskExcl = ee.Image(0);
        exclusion.years.forEach(function(year) {
            yearMaskExcl = yearMaskExcl.addBands(ee.Image(0).rename('classification_' + String(year)));
        });
        yearMaskExcl = yearMaskExcl.slice(1).selfMask();
        inputImage = inputImage.addBands(yearMaskExcl, null, true);
    }
    
    // Exclude classes
    if (exclusion.classes.length > 0) {
        var inputImageBands = inputImage.bandNames().getInfo();
        inputImageBands.forEach(function(band) {
            exclusion.classes.forEach(function(classId) {
                var imageYear = inputImage.select(band);
                var imageExclusion = imageYear.updateMask(imageYear.unmask().neq(classId));
                inputImage = inputImage.addBands(imageExclusion, null, true);
            });
        });
    }
    
    return inputImage;
}

/**
 * Forward fill function
 */
function forward_fill(image) {
    var bandNames = image.bandNames();
    var first = image.select([0]);
    var idx = ee.List.sequence(1, bandNames.size().subtract(1));
    
    var result = idx.iterate(gap_fill, {
        image_filled: first,
        image_base: image
    });
    
    return ee.Image(ee.Dictionary(result).get('image_filled')).rename(bandNames);
}

/**
 * Backward fill function
 */
function backward_fill(image) {
    var bandNames = image.bandNames();
    var reversedIdx = ee.List.sequence(bandNames.size().subtract(1), 0, -1);
    
    image = image.select(reversedIdx);
    var last = image.select([0]);
    var idx = ee.List.sequence(1, bandNames.size().subtract(1));
    
    var result = idx.iterate(gap_fill, {
        image_filled: last,
        image_base: image
    });
    
    return ee.Image(ee.Dictionary(result).get('image_filled'))
        .select(reversedIdx)
        .rename(bandNames);
}

/**
 * Gap fill helper function
 */
function gap_fill(current_year_index, obj) {
    obj = ee.Dictionary(obj);
    
    var previous_year_index = ee.Number(current_year_index).subtract(1);
    var image_filled = ee.Image(obj.get('image_filled'));
    var image_base = ee.Image(obj.get('image_base'));
    var current_image = image_base.select([ee.Number(current_year_index)]);
    var previous_image_filled = image_filled.select([previous_year_index]);
    var current_filled = current_image.unmask(previous_image_filled);
    
    obj = obj.set('image_filled', image_filled.addBands(current_filled));
    
    return obj;
}

/**
 * Create mask based on condition of minimum bands with value 74
 * @param {ee.Image} image - Multiband classification image
 * @param {number} minBandsCount - Minimum number of bands with value 74 required
 * @returns {ee.Image} Mask image where condition is true
 */
function createMask74(image, minBandsCount) {
    // Count how many bands have value 74 for each pixel
    var count74 = image.eq(74).reduce(ee.Reducer.sum());
    
    // Create mask where count is >= specified minimum
    var mask = count74.gte(minBandsCount);
    
    return mask;
}