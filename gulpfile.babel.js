// Gulp.js configuration

//------------------------------------------------------------------
// Required Modules
// -----------------------------------------------------------------

// Generic modules
import del from 'del'
import fs from 'fs'
import browserSync from 'browser-sync'
import yaml from 'js-yaml'
import vinylpaths from 'vinyl-paths'
import browser from 'browser-sync'

// Gulp-specific modules
import gulp from 'gulp'
import gulpif from 'gulp-if'
import newer from 'gulp-newer'
import imagemin from 'gulp-imagemin'
import concat from 'gulp-concat'
import deporder from 'gulp-deporder'
import stripdebug from 'gulp-strip-debug'
import uglify from 'gulp-uglify'
import sass from 'gulp-sass'
import postcss from 'gulp-postcss'
import realFavicon from 'gulp-real-favicon'
import svgmin from 'gulp-svgmin'
import gcallback from 'gulp-callback'

// Bower-specific modules
import mainBowerFiles from 'main-bower-files'
import bowerNormalizer from 'gulp-bower-normalize'

// PostCss-specific modules
import cssnano from 'cssnano'
import cssnext from 'postcss-cssnext'
import assets from 'postcss-assets'
import mqpacker from 'css-mqpacker'
import rucksack from 'rucksack-css'
import stylelint from 'stylelint'
import cssImport from 'postcss-import'
import fontMagician from 'postcss-font-magician'
import uncss from 'postcss-uncss'
import syntax from 'postcss-scss'
import reporter from 'postcss-reporter'

// Metalsmith-specific modules
import metalsmith from 'gulp-metalsmith'
import markdown from 'metalsmith-markdown'
import writemetadata from 'metalsmith-writemetadata'
import layouts from 'metalsmith-layouts'
import htmlmin from 'metalsmith-html-minifier'
import mdebug from 'metalsmith-debug'
import inplace from 'metalsmith-in-place'


//------------------------------------------------------------------
// Global Vars and Consts
// -----------------------------------------------------------------

// development mode
var devBuild = ((process.env.NODE_ENV || '').trim().toLowerCase() !== 'production');

// Set constants by config.yml
const {
    FOLDERS,
    FILES,
    SERVER,
    GLOMATCH,
    MSTML,
    SASS_CONF,
    AUTOPREFIXER_CONF,
    STYLELINT_CONF,
    REPORTER_CONF
} = loadConfig();


//------------------------------------------------------------------
// Assets Processing
// -----------------------------------------------------------------


///
// Image processing
///
gulp.task('images', function () {
    var out = FOLDERS.buildimg;
    return gulp.src(FOLDERS.srcimg + GLOMATCH.allsuballfiles)
        .pipe(newer(out))
        .pipe(imagemin({ optimizationLevel: 5 }))
        .pipe(gulp.dest(out));
});


///
// Svg processing
///
gulp.task('svg', function () {
    return gulp.src(FOLDERS.srcsvg + '*.svg')
        .pipe(svgmin({
            plugins: [{
                removeHiddenElems: true
            }]
        }))
        .pipe(gulp.dest(FOLDERS.buildsvg));
});


///
// JavaScript processing
///
gulp.task('vendorjs', function () {

    var jsbuild = gulp.src(FOLDERS.srclib + GLOMATCH.allsuballjs)
        .pipe(deporder())
        .pipe(concat(FILES.vendorjs));

    if (!devBuild) {
        jsbuild = jsbuild
            .pipe(stripdebug())
            .pipe(uglify());
    }

    return jsbuild.pipe(gulp.dest(FOLDERS.buildjs));
});

gulp.task('js', gulp.series('vendorjs', function () {

    var jsbuild = gulp.src(FOLDERS.srcjs + GLOMATCH.allsuballfiles)
        .pipe(deporder())
        .pipe(concat(FILES.mainjs));

    if (!devBuild) {
        jsbuild = jsbuild
            .pipe(stripdebug())
            .pipe(uglify());
    }

    return jsbuild.pipe(gulp.dest(FOLDERS.buildjs));
}));


///
// CSS processing
///
gulp.task('vendorcss', function () {

    // Dev PostCss configuration
    //--//

    // Production PostCss configuration
    var postCssOpts = [
        cssnano
    ];

    return gulp.src(FOLDERS.srclib + GLOMATCH.allsuballcss)
        .pipe(concat(FILES.vendorcss))
        .pipe(gulpif((!devBuild), postcss(postCssOpts))) //production
        .pipe(gulp.dest(FOLDERS.buildcss));
});

gulp.task('css', gulp.series('vendorcss', 'images', function () {

    // Common PostCss configuration
    var postCssOpts = [
        assets({
            loadPaths: [
                FOLDERS.srcimg,
                FOLDERS.srcfont
            ],
            basePath: FOLDERS.src,
            relative: FOLDERS.srcscss,
            cachebuster: true
        }),
        cssImport,
        cssnext({
            browsers: AUTOPREFIXER_CONF.browsers
        }),
        rucksack,
        mqpacker,
        fontMagician({ hosted: [FOLDERS.srcfont] }),

    ];

    // Dev PostCss configuration
    if (devBuild) {
        postCssOpts.push(stylelint({
            config: STYLELINT_CONF
        }));
        postCssOpts.push(reporter(REPORTER_CONF));
    }

    // Production PostCss configuration
    if (!devBuild) {
        postCssOpts.push(cssnano);
    }

    return gulp.src(FOLDERS.srcscss + FILES.mainscss)
        .pipe(postcss(postCssOpts, { parser: syntax }))
        .pipe(sass(SASS_CONF))
        .pipe(gulp.dest(FOLDERS.buildcss));
}));

gulp.task('uncss', function (cb) {
    if (!devBuild) {
        var postCssOpts = [uncss({
            html: [FOLDERS.build + GLOMATCH.allhtml]
        })];
        gulp.src(FOLDERS.buildcss + GLOMATCH.allsuballcss)
            .pipe(postcss(postCssOpts))
            .pipe(vinylpaths(del))
            .pipe(gulp.dest(FOLDERS.buildcss).on('end', function () {
                cb();
            }))
    } else {
        cb();
    }
});

//------------------------------------------------------------------
// Metalsmith Template Processing
// -----------------------------------------------------------------


gulp.task('templating', function () {

    var mst = MSTML;

    var msc = {
        root: FOLDERS.base,
        ignore: ['src/assets/**/*', 'src/lib/**/*'],
        use: [layouts(mst)]
    };

    if (devBuild) {
        msc.use.push(
            writemetadata({ pattern: [GLOMATCH.allsuballfiles] }))
    } else {
        msc.use.push(htmlmin());

    };

    return gulp.src('src/*.html')
        .pipe(metalsmith(msc))
        .pipe(gulp.dest('build'));
});


//------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------


// Load settings from settings.yml
function loadConfig() {
    let ymlFile = fs.readFileSync('config.yml', 'utf8');
    var conf = yaml.load(ymlFile);
    //inject current folder as base if base setting is empty
    if (conf.FOLDERS.base == "") { conf.FOLDERS.base = __dirname + '/' };
    return conf;
}

// BrowserSync
function server(done) {
    browser.init({
        server: FOLDERS.build, port: SERVER.port,
        browser: SERVER.browser
    });
    done();
}

// Clean lib folder in src
gulp.task('cleanlib', function () {
    return del(FOLDERS.srclib);
});

// Import bower main files into lib folder
gulp.task('vendor', function () {
    return gulp.src(mainBowerFiles())
        .pipe(bowerNormalizer())
        .pipe(gulp.dest(FOLDERS.srclib))
});

// Reload the browser with BrowserSync
gulp.task('reload', function (done) {
    browser.reload();
    done();
});

// Delete the "build" folder
function cleanbuild(done) {
    return del(FOLDERS.build);
}

// Update favicon
var FAVICON_DATA_FILE = 'faviconData.json';
gulp.task('generate-favicon', function (done) {
    realFavicon.generateFavicon({
        masterPicture: FOLDERS.srcimg + FILES.logo,
        dest: FOLDERS.build,
        iconsPath: '/',
        design: {
            ios: {
                pictureAspect: 'noChange',
                assets: {
                    ios6AndPriorIcons: false,
                    ios7AndLaterIcons: false,
                    precomposedIcons: false,
                    declareOnlyDefaultIcon: true
                }
            },
            desktopBrowser: {},
            windows: {
                pictureAspect: 'noChange',
                backgroundColor: '#da532c',
                onConflict: 'override',
                assets: {
                    windows80Ie10Tile: false,
                    windows10Ie11EdgeTiles: {
                        small: false,
                        medium: true,
                        big: false,
                        rectangle: false
                    }
                }
            },
            androidChrome: {
                pictureAspect: 'noChange',
                themeColor: '#ffffff',
                manifest: {
                    display: 'standalone',
                    orientation: 'notSet',
                    onConflict: 'override',
                    declared: true
                },
                assets: {
                    legacyIcon: false,
                    lowResolutionIcons: false
                }
            },
            safariPinnedTab: {
                pictureAspect: 'silhouette',
                themeColor: '#5bbad5'
            }
        },
        settings: {
            compression: 5,
            scalingAlgorithm: 'Spline',
            errorOnImageTooSmall: false
        },
        markupFile: FAVICON_DATA_FILE
    }, function () {
        done();
    });
});
gulp.task('inject-favicon-markups', function () {
    return gulp.src(FOLDERS.srctemplatepartials + FILES.meta)
        .pipe(realFavicon.injectFaviconMarkups(JSON.parse(fs.readFileSync(FAVICON_DATA_FILE)).favicon.html_code))
        .pipe(vinylpaths(del))
        .pipe(gulp.dest(FOLDERS.srctemplatepartials));
});
gulp.task('check-for-favicon-update', function (cb) {
    if (fs.exists(FAVICON_DATA_FILE)) {
        var currentVersion = JSON.parse(fs.readFileSync(FAVICON_DATA_FILE)).version;
        realFavicon.checkForUpdates(currentVersion, cb);
    } else {
        cb();
    }
});


//------------------------------------------------------------------
// Group Tasks
// -----------------------------------------------------------------

// Clean build folder
gulp.task('clean', cleanbuild);

//Init BrowserSync
gulp.task('syncbrowser', server);

// Normalize vendor components into the lib folder
gulp.task('vendorAssets', gulp.series('cleanlib', 'vendor'));

// Optimization for custom assets
gulp.task('customAssets', gulp.parallel('images', 'svg', 'css', 'js'));

// Build html file by Metalsmith engine
gulp.task('html', gulp.series('templating'));

// Main Assets Task
gulp.task('assets', gulp.series('vendorAssets', 'customAssets', 'html'));

// Update favicon
gulp.task('favicon', gulp.series('check-for-favicon-update', 'generate-favicon', 'inject-favicon-markups'));

// Update meta tag in html
gulp.task('htmlmeta', gulp.series('favicon'));

// Final optimization
gulp.task('optimize', gulp.series('uncss'));

//------------------------------------------------------------------
// Whatching
// -----------------------------------------------------------------

function watch() {
    // lib
    gulp.watch('bower.json').on('all', gulp.series('vendor', 'css', 'js', browser.reload));
    // favicon
    gulp.watch(FOLDERS.srcimg + FILES.logo).on('all', gulp.series('favicon', browser.reload));
    // image
    gulp.watch(FOLDERS.srcimg + GLOMATCH.allsub + GLOMATCH.allfiles).on('all', gulp.series('images', browser.reload));
    // html
    gulp.watch(FOLDERS.srctemplate + GLOMATCH.allsub + GLOMATCH.allfiles).on('all', gulp.series('templating', browser.reload));
    // js
    gulp.watch(FOLDERS.srcjs + GLOMATCH.allsub + GLOMATCH.allfiles).on('all', gulp.series('js', browser.reload));
    // css
    gulp.watch(FOLDERS.srcscss + GLOMATCH.allsub + GLOMATCH.allfiles).on('all', gulp.series('css', browser.reload));
    //svg
    gulp.watch(FOLDERS.srcsvg + GLOMATCH.allsub + GLOMATCH.allfiles).on('all', gulp.series('svg', browser.reload));
    //templating
    gulp.watch(FOLDERS.srctemplate + GLOMATCH.allsuballfiles).on('all', gulp.series('templating', browser.reload));
};

//------------------------------------------------------------------
// Automation
// -----------------------------------------------------------------

// Build the "dist" folder by running all of the below tasks
gulp.task('build', gulp.series('clean', 'htmlmeta', 'assets', 'optimize'));

// DEFAULT TASK
gulp.task('default', gulp.series('build', 'syncbrowser', watch));