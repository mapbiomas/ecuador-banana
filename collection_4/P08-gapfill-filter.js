/**
 * @name
 *      P08-gapfill-filter.js
 *
 * @description
 *      Banana cross-cutting theme - MapBiomas Ecuador Collection 4.
 *      Step 8: temporal gap fill of the banana classification, applied only
 *      to pixels that are banana in many years.
 *
 *      1. Class 27 (not banana) and missing years are treated as gaps, so
 *         only the banana years (74) carry information.
 *      2. Only pixels classified as banana in at least `minBananaYears`
 *         years are kept; all other pixels are masked in every year.
 *      3. The gaps of the kept pixels are filled from the nearest banana
 *         year in ONE direction:
 *            't0tn_tnt0': from past years   -> banana from its first year onward
 *            'tnt0_t0tn': from future years -> banana until its last year
 *         Years before the first (or after the last) banana year stay masked.
 *
 *      Example (fillOrder 't0tn_tnt0', minBananaYears 3):
 *          Input:   27 27 74 27 74 74 27 74
 *          Output:   -  - 74 74 74 74 74 74     (- = masked)
 *
 *      Masked pixels have no class in the output; the next step should treat
 *      them as 27.
 *
 *      Exclusions (applied before filling):
 *        - exclusion.years: the whole year is discarded and refilled from
 *          its neighbors.
 *        - exclusion.classes: those classes are discarded and refilled.
 *
 * @usage
 *      1. Run P07-spatial-filter.js and export its output (version `versionInput`).
 *      2. Set PARAMS, run and compare "Input <year>" and "Gapfill <year>".
 *      3. Start the export task from the Tasks tab.
 *
 * @inputs
 *      <paths.pathClassificationBananaFilterAct><COUNTRY>-<regionId>-<versionInput>
 *
 * @outputs
 *      <paths.pathClassificationBananaFilterAct><COUNTRY>-<regionId>-<versionOutput>
 *
 * @author
 *      MapBiomas Ecuador Team - EcoCiencia
 *
 * @version
 *      1.0.0 (2025)
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

  versionInput: 994,                // output of P07
  versionOutput: 995,

  // 't0tn_tnt0': fill from past years; 'tnt0_t0tn': fill from future years.
  fillOrder: 't0tn_tnt0',

  // Minimum number of banana years for a pixel to be kept.
  minBananaYears: 10,

  // Years of the time series.
  years: { first: 1985, last: 2025 },

  yearsPreview: [1985, 1986, 1988, 1996, 2015, 2023, 2024],

  exclusion: {
    classes: [],    // classes discarded (and refilled) in every year
    years: []       // years discarded (and refilled) with all their classes
  },

  // Area chart (ha) of some classes after the filter.
  plot: {
    plotGraph: true,
    classGraph: [74]
  }
};


// =============================================================================
// 2. MODULES AND CONSTANTS
// =============================================================================

var paths = require('users/mapbiomasecuador/LULC:COLECCION4/05-modules/CollectionDirectories.js').paths;

var BANANA = 74;
var OTHER = 27;

var YEARS = [];
for (var y = PARAMS.years.first; y <= PARAMS.years.last; y++) { YEARS.push(y); }

var BAND_NAMES = YEARS.map(function (year) { return 'classification_' + year; });

var BANANA_VIS = { min: OTHER, max: BANANA, palette: ['b5b5b5', 'be83f7'] };
var MOSAIC_VIS = { bands: ['nir_median', 'swir1_median', 'red_median'], min: 0, max: 5133, gamma: 1.06 };


// =============================================================================
// 3. FUNCTIONS
// =============================================================================

/**
 * One band per year of YEARS. Missing years and class 27 are masked (gaps).
 */
function loadGaps(image) {
  var inputBands = image.bandNames();
  var missingBands = ee.List(BAND_NAMES).removeAll(inputBands);

  print('Years added (missing in the input)', missingBands);

  var missingImages = ee.ImageCollection(missingBands.map(function (name) {
    return ee.Image(OTHER).rename(ee.String(name)).set('year', ee.String(name).slice(-4));
  }));

  var validImages = ee.ImageCollection(inputBands.map(function (name) {
    return image.select([name]).set('year', ee.String(name).slice(-4));
  }));

  return missingImages.merge(validImages)
    .map(function (band) { return band.updateMask(band.unmask().neq(OTHER)); })
    .sort('year')
    .toBands()
    .updateMask(image.select([inputBands.get(0)]))
    .rename(BAND_NAMES);
}

/**
 * Masks the excluded years (whole band) and classes, so they are refilled.
 */
function maskExclusions(image, exclusion) {
  exclusion.years.forEach(function (year) {
    var name = 'classification_' + year;
    image = image.addBands(ee.Image(0).selfMask().rename(name), null, true);
  });

  if (exclusion.classes.length > 0) {
    image = ee.Image.cat(BAND_NAMES.map(function (name) {
      var band = image.select(name);
      exclusion.classes.forEach(function (classId) {
        band = band.updateMask(band.unmask().neq(classId));
      });
      return band;
    }));
  }

  return image.select(BAND_NAMES);
}

/**
 * Fills masked pixels with the previous band (t0 -> tn).
 */
function forwardFill(image) {
  var bandNames = image.bandNames();
  var indexes = ee.List.sequence(1, bandNames.size().subtract(1));

  var filled = indexes.iterate(function (index, previous) {
    previous = ee.Image(previous);
    var current = image.select([ee.Number(index)]);
    var previousFilled = previous.select([ee.Number(index).subtract(1)]);
    return previous.addBands(current.unmask(previousFilled));
  }, image.select([0]));

  return ee.Image(filled).rename(bandNames);
}

/**
 * Fills masked pixels with the next band (tn -> t0).
 */
function backwardFill(image) {
  var bandNames = image.bandNames();
  var reversedIndexes = ee.List.sequence(bandNames.size().subtract(1), 0, -1);

  return forwardFill(image.select(reversedIndexes))
    .select(reversedIndexes)
    .rename(bandNames);
}

/**
 * Mosaic of a year. From 2022 on, Landsat 8 is used.
 * TODO: no 2026 mosaic yet; the 2025 Landsat 9 mosaic is shown instead.
 */
function getYearMosaic(mosaics, year) {
  if (year === 2026) {
    return mosaics.filter(ee.Filter.eq('year', 2025)).filter(ee.Filter.eq('satellite', 'l9')).mosaic();
  }
  var yearMosaics = mosaics.filter(ee.Filter.eq('year', year));
  if (year >= 2022) {
    yearMosaics = yearMosaics.filter(ee.Filter.eq('satellite', 'l8'));
  }
  return yearMosaics.mosaic();
}


// =============================================================================
// 4. GAP FILL
// =============================================================================

var region = ee.FeatureCollection(paths.pathRegionesBanana)
  .filter(ee.Filter.eq('region', PARAMS.regionId));

var regionMask = region
  .map(function (f) { return f.set('version', 1); })
  .reduceToImage(['version'], ee.Reducer.first());

var input = ee.Image(paths.pathClassificationBananaFilterAct + PARAMS.country + '-' + PARAMS.regionId + '-' + PARAMS.versionInput)
  .unmask(OTHER)
  .updateMask(regionMask);

print('Input image', input);

var gaps = maskExclusions(loadGaps(input), PARAMS.exclusion);

// Pixels that are banana in at least `minBananaYears` years.
var persistentBanana = gaps.eq(BANANA).reduce(ee.Reducer.sum()).gte(PARAMS.minBananaYears);

var filled = PARAMS.fillOrder === 'tnt0_t0tn' ? backwardFill(gaps) : forwardFill(gaps);

filled = filled
  .updateMask(persistentBanana)
  .updateMask(regionMask)
  .set({
    country: PARAMS.country,
    region: PARAMS.regionId,
    version: PARAMS.versionOutput,
    step: 'Gapfill',
    theme: 'Banana'
  });

print('Output image', filled);


// =============================================================================
// 5. MAP AND CHART
// =============================================================================

var mosaics = ee.ImageCollection(paths.mosaicRaisgAct)
  .merge(ee.ImageCollection(paths.mosaicPacificoAct))
  .filter(ee.Filter.eq('country', PARAMS.country))
  .filterBounds(region);

Map.addLayer(region.style({ fillColor: 'FF000000', color: 'FF0000' }), {}, 'Region ' + PARAMS.regionId, false);
Map.addLayer(persistentBanana.selfMask(), { palette: ['be83f7'] }, 'Pixels with >= ' + PARAMS.minBananaYears + ' banana years', false);

// For each preview year: mosaic, input and gap-filled result.
PARAMS.yearsPreview.forEach(function (year) {
  var name = 'classification_' + year;
  Map.addLayer(getYearMosaic(mosaics, year).updateMask(regionMask), MOSAIC_VIS, 'Mosaic ' + year, false);
  Map.addLayer(input.select(name), BANANA_VIS, 'Input ' + year, false);
  Map.addLayer(filled.select(name), BANANA_VIS, 'Gapfill ' + year, false);
});

if (PARAMS.plot.plotGraph) {
  print('Note: the charts are approximate; the 30 m maps are resampled to 250 m.');

  PARAMS.plot.classGraph.forEach(function (classId) {
    print(ui.Chart.image.regions({
      image: filled.eq(classId).multiply(6.25).selfMask(),
      regions: region.geometry().bounds(),
      reducer: ee.Reducer.sum(),
      scale: 250,
      seriesProperty: 'system:id',
      xLabels: YEARS
    })
      .setChartType('LineChart')
      .setOptions({
        title: 'Class ' + classId + ' - filtered (250 m)',
        hAxis: { title: 'Year', titleTextStyle: { italic: false, bold: true } },
        vAxis: { title: 'Area (ha)', titleTextStyle: { italic: false, bold: true } },
        colors: ['#be83f7'],
        lineSize: 3
      }));
  });
}


// =============================================================================
// 6. EXPORT
// =============================================================================

var fileName = PARAMS.country + '-' + PARAMS.regionId + '-' + PARAMS.versionOutput;

Export.image.toAsset({
  image: filled.byte().reproject('EPSG:4326', null, 30),
  description: fileName,
  assetId: paths.pathClassificationBananaFilterAct + fileName,   // path must end with '/'
  scale: 30,
  pyramidingPolicy: { '.default': 'mode' },
  maxPixels: 1e13,
  region: region.geometry().bounds()
});
