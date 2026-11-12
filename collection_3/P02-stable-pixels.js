/**
 * 
 * @name
 *      P02-stable-pixels.js
 * 
 * @description
 *      Generates the stable pixel map for the banana cross-cutting theme.
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

var inclusion = /* color: #abd615 */ee.FeatureCollection(
        [ee.Feature(
            ee.Geometry.Polygon(
                [[[-79.61635080575972, -1.7237148395989812],
                  [-79.61776701211959, -1.721527146175013],
                  [-79.61952654123336, -1.7234574640324578],
                  [-79.61738077402144, -1.7250875086993993]]]),
            {
              "system:index": "0"
            })]),
    exclusion = /* color: #54ebff */ee.FeatureCollection(
        [ee.Feature(
            ee.Geometry.Polygon(
                [[[-79.61974520362983, -1.7284901253330553],
                  [-79.61978811897407, -1.726388229131306],
                  [-79.62193388618599, -1.7262166456652526],
                  [-79.62167639412056, -1.7296483120418935]]]),
            {
              "system:index": "0"
            })]),
    geometryPlanet = 
    /* color: #d63000 */
    /* displayProperties: [
      {
        "type": "rectangle"
      }
    ] */
    ee.Geometry.Polygon(
        [[[-79.68116437793509, 0.5225611403312683],
          [-79.68116437793509, -0.224501352948377],
          [-78.78028547168509, -0.224501352948377],
          [-78.78028547168509, 0.5225611403312683]]], null, false);
/**
 * Parameters
 */          
var country = 'ECUADOR';

var region_id = 40910;

var input_version = 1;

var output_version = 998;

var years_preview = [1985, 1986, 1987];

var polygons = [inclusion, exclusion];

var remaps = {
    from: [3, 4, 5, 6, 9, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 23, 24, 25, 26, 29, 30, 31, 32, 33, 34, 35],
    to: [27, 27, 27, 27, 27, 27, 27, 27, 21, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 21]
};

var addPlanetData = false; // true or false

var year = 2024;

var dates = [
    // ['January', year + '-01-01', year + '-01-31'],
    // ['February', year + '-02-01', year + '-02-28'],
    // ['March', year + '-03-01', year + '-03-31'],
    // ['April', year + '-04-01', year + '-04-30'],
    // ['May', year + '-05-01', year + '-05-31'],
    // ['June', year + '-11-01', year + '-11-30'],
    ['July', year + '-07-01', year + '-07-31'],
    ['August', year + '-08-01', year + '-08-31'],
    ['September', year + '-09-01', year + '-09-30'],
    ['October', year + '-10-01', year + '-10-31'],
    ['November', year + '-11-01', year + '-11-30'],
    ['December', year + '-12-01', year + '-12-31'],
];

var paths = require('users/mapbiomasecuador/LULC:COLECCION3/05-modules/CollectionDirectories.js').paths;

var palette = require('users/mapbiomas/modules:Palettes.js').get('classification8');

var banana_asset = 'projects/mapbiomas-ecuador/assets/AUXILIAR-DATA/VECTOR/COLLECTION-3/BANANO/Areas-banano-2018-2022';

var stable_banana_name = 'ME-' + country + '-' + region_id + '-' + input_version;

var output_name = 'ME-' + country + '-' + region_id + '-' + output_version;

/**
 * Data Loading
 */
var region = ee.FeatureCollection(paths.pathRegionesBanana)
    .filter(ee.Filter.eq('id_regionC', region_id));

var region_raster = region
    .map(function(f) { return f.set('version', 1); })
    .reduceToImage(['version'], ee.Reducer.first());

var mosaic = ee.ImageCollection(paths.mosaicRaisgAct)
    .merge(ee.ImageCollection(paths.mosaicPacificoAct))
    .filterBounds(region.geometry())
    .filter(ee.Filter.inList('year', years_preview));

var previous = ee.Image(paths.integratationEcuColAnt)
    .updateMask(region_raster);

var banana_mask = ee.FeatureCollection(banana_asset)
    .map(function(feature) { return feature.buffer(400).set('version', 0); })
    .reduceToImage(['version'], ee.Reducer.first())
    .updateMask(region_raster);

var stable_banana = ee.Image(paths.pathRoiStableBananaAct + stable_banana_name);

/**
 * Mosaic Visualization
 */
years_preview.forEach(function(year) {
    var yearMosaic = mosaic.filter(ee.Filter.eq('year', year));
    
    if (year == 2022 || year == 2023 || year == 2024) {
        yearMosaic = yearMosaic.filterMetadata('satellite', 'equals', 'l8');
    } else if (year == 2025) {
        yearMosaic = mosaic.filter(ee.Filter.eq('year', 2024));
        yearMosaic = yearMosaic.filterMetadata('satellite', 'equals', 'l9');
    }
    
    yearMosaic = yearMosaic.mosaic().clip(region.geometry()).updateMask(region_raster);
    
    Map.addLayer(yearMosaic, {
        'bands': ['nir_median', 'swir1_median', 'red_median'],
        'min': 0,
        'max': 5133,
        'gamma': 1.06
    }, 'Mosaic-' + year, false);
});

/**
 * Combined Mask
 * Stable Pixels
 */
var mask = ee.Image(1).updateMask(region_raster).blend(banana_mask).selfMask();

var classes = ee.List.sequence(1, 75).getInfo();

var stable_pixels = getStablePixels(previous)
    .remap(remaps.from, remaps.to)
    .multiply(mask)
    .blend(stable_banana);

stable_pixels = includeExcludeAreas(stable_pixels, polygons[0], polygons[1]);

/**
 * Export Stable Pixels
 * Display Results
 */
Export.image.toAsset({
    image: stable_pixels.byte(),
    description: output_name,
    assetId: paths.pathStablePixelsBananaAct + output_name,
    scale: 30,
    pyramidingPolicy: { '.default': 'mode' },
    maxPixels: 1e13,
    region: region.geometry().bounds()
});

Map.addLayer(region.style({ fillColor: "FF000000", color: "FF0000" }), {}, 'Region', false);

Map.addLayer(
    stable_pixels, {
        min: 27,
        max: 74,
        palette: ['#b5b5b5', '#be83f7']
    },
    'Stable Pixels',
    true
);

/**
 * Get stable pixels from time series image
 * Pixels that never change value over the entire time series
 */
function getStablePixels(image) {
    var min_image = image.reduce(ee.Reducer.min());
    var max_image = image.reduce(ee.Reducer.max());
    var stable_mask = min_image.eq(max_image);
    return min_image.updateMask(stable_mask);
}

/**
 * Include and exclude areas using geometry polygons
 */
function includeExcludeAreas(image, included, excluded) {
    var band_name = image.bandNames().get(0);
    
    // Inclusion polygons
    if (included) {
        var included_size = included.size();
        image = ee.Algorithms.If(
            included_size.gt(0),
            ee.ImageCollection([
                image,
                included
                    .map(function(f) { return f.set('version', 74); })
                    .reduceToImage(['version'], ee.Reducer.first())
                    .rename([band_name])
            ]).mosaic(),
            image
        );
    }
    
    // Exclusion polygons
    if (excluded) {
        var excluded_size = excluded.size();
        image = ee.Algorithms.If(
            excluded_size.gt(0),
            ee.Image(image).updateMask(
                excluded
                    .map(function(f) { return f.set('mask_value', 0); })
                    .reduceToImage(['mask_value'], ee.Reducer.first())
                    .unmask(1)
            ),
            image
        );
    }
    
    return ee.Image(image).byte();
}

var bananaMask = ee.FeatureCollection('projects/mapbiomas-ecuador/assets/AUXILIAR-DATA/VECTOR/COLLECTION-3/BANANO/Areas-banano-2018-2022');
Map.addLayer(bananaMask, {}, 'Banana Mask');

var grid = ee.FeatureCollection('projects/mapbiomas-raisg/DATOS_AUXILIARES/VECTORES/ECUADOR/grillaEcuador5km');
Map.addLayer(
    grid.style({
        color: 'white',
        fillColor: '00000000'
    }),
    {}, 'Grid', false
);

if (addPlanetData) {
    var geometryPlanet = region.geometry();
    var nicfi = ee.ImageCollection('projects/planet-nicfi/assets/basemaps/americas').filterBounds(geometryPlanet);
    print('Planet NICFI collection:', nicfi);
    
    var vis = {"bands": ["R", "G", "B"], "min": 350, "max": 3000, "gamma": 2.25};
    
    dates.forEach(function(date) {
        try {
            print(date);
            var basemap = nicfi.filter(ee.Filter.date(date[1], date[2])).first();
            Map.addLayer(basemap.clip(geometryPlanet), vis, 'PLANET ' + date[0] + year, false);
        } catch (error) {
            print(error.message);
        }
    });
}