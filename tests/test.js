'use strict';

/* eslint-disable quotes */

import filter from '../lib/filter.js';
import * as utils from '../lib/utils.js';
import resize from '../lib/resize.js';
import * as optimize from '../lib/optimize.js';
import svg2to11 from '../lib/svg2to11.js';
import text2foreignObject from '../lib/text2foreignObject.js';
import * as transforms from '../lib/transforms.js';
import {sync as commandExists} from 'command-exists';
import {execSync} from 'child_process';


describe('utils', () => {
  describe('utils.compatibleOutputFormat', () => {
    it("says format 'html' is supported", () => {
      expect(utils.compatibleOutputFormat('html')).toBeTruthy();
    });

    it("says format 'docx' is not supported", () => {
      // Suppress console.error() output.
      const stderr =
          jest.spyOn(console, 'error').mockImplementationOnce(() => {});
      expect(utils.compatibleOutputFormat('docx')).toBeFalsy();
      expect(stderr).toHaveBeenCalled();
    });
  });

  describe('utils.isFigure and utils.isImage', () => {
    const image = ({title = ''} = {}) => {
      return {
        't': 'Image', 'c': [
          ['', [], []],
          [{'t': 'Str', 'c': 'Caption'}],
          ['', title],
        ],
      };
    };

    describe('utils.isFigure', () => {
      it('identifiers figure', () => {
        expect(utils.isFigure('Para', [image({title: 'fig:A figure'})]))
            .toEqual(true);
      });

      it('says Image is not a figure', () => {
        expect(utils.isFigure(image())).toEqual(false);
      });
    });

    describe('utils.isImage', () => {
      it('identifies Image', () => {
        expect(utils.isImage('Image')).toEqual(true);
      });

      it('says Para is not an image', () => {
        expect(utils.isImage('Para')).toEqual(false);
      });
    });
  });

  describe('utils.isSVG', () => {
    it('says SVG is SVG', () => {
      expect(utils.isSVG('./path/to/image.svg')).toBeTruthy();
    });

    it('says JPG is not SVG', () => {
      expect(utils.isSVG('./path/to/image.jpg')).toBeFalsy();
    });
  });

  describe('utils.loadSVG', () => {
    it('returns SVG contents if it exists', () => {
      expect(utils.loadSVG('tests/empty.svg')).toEqual('<svg></svg>');
    });

    it("returns `null` if SVG doesn't exist", () => {
      // Suppress console.error() output.
      const stderr =
          jest.spyOn(console, 'error').mockImplementationOnce(() => {});
      expect(utils.loadSVG('./non-existant.svg')).toBeNull();
      expect(stderr).toHaveBeenCalled();
    });
  });

  describe('utils.createDOM', () => {
    it('creates DOM containing SVG', () => {
      const svg = utils.loadSVG('./tests/example-math.svg');
      const svgDOM = utils.createDOM(svg);
      expect(svgDOM.querySelector('svg')).toBe(svgDOM.body.children[0]);
    });
  });

  describe('utils.serialize', () => {
    it('serializes DOM', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
          '<path/>' +
          '<foreignObject>' +
            '<div></div>' +
          '</foreignObject>' +
        '</svg>';
      const svgDOM = utils.createDOM(svg);
      expect(utils.serialize(svgDOM)).toEqual(svg);
    });
  });

  describe('utils.round', () => {
    it('removes floating point errors', () => {
      expect(utils.round(0.999999999999997)).toEqual(1);
    });
  });

  describe('utils.flattenTextChildren', () => {
    it('flattens children of <text> elements', () => {
      const svg =
        '<svg viewBox="0 0 20 10">\n' +
          '<text x="3.1416" y="2.7183">' +
            '<tspan>Math: $a$.</tspan>' +
            '<tspan>More text.</tspan>' +
            '$E=mc^2$' +
          '</text>\n' +
        '</svg>';
      const svgDOM = utils.createDOM(svg);
      const text = svgDOM.querySelector('text');
      utils.flattenTextChildren(text);
      expect(svgDOM.querySelector('tspan')).toEqual(null);
    });
  });

  describe('utils.pandoc', () => {
    it('executes pandoc', () => {
      const html = utils.pandoc({
        from: 'markdown',
        to: 'html',
        input: '$E=mc^2$',
        options: '--mathjax',
      });
      expect(html)
          .toEqual('<p><span class="math inline">\\(E=mc^2\\)</span></p>\n');
    });
  });

  describe('utils.ast2html', () => {
    test.each`
        input                                           | expected
        ${[{t: 'Str', c: 'Caption'}]}                   | ${'Caption'}
        ${[{t: 'Emph', c: [{t: 'Str', c: 'Caption'}]}]} | ${'<em>Caption</em>'}
      `("ast2html('$input') returns '$expected'", ({input, expected}) => {
      expect(utils.ast2html(input)).toEqual(expected);
    });
  });

  describe('utils.convertMathJaxDelimiters', () => {
    it("replaces '$' with '\\(' and '\\)'", () => {
      expect(utils.convertMathJaxDelimiters(
          'Text. $E=mc^2$, $c^2=a^2+b^2$, dollar sign: $')).toEqual(
          'Text. \\(E=mc^2\\), \\(c^2=a^2+b^2\\), dollar sign: $');
    });
  });

  describe('utils.md2html', () => {
    it('works when input is an equation', () => {
      const html = utils.md2html('$E=mc^2$');
      expect(html)
          .toEqual('<p><span class="math inline">\\(E=mc^2\\)</span></p>');
    });

    it("works when input isn't an equation", () => {
      const html = utils.md2html('Some **bold** text');
      expect(html).toEqual('<p>Some <strong>bold</strong> text</p>');
    });
  });

  describe('utils.toHTML5keyvals', () => {
    test.each`
        input               | expected
        ${['key', 'val']}   | ${['data-key', 'val']}
        ${['style', 'val']} | ${['style', 'val']}
      `("toHTML5keyvals('$input') returns '$expected'", ({input, expected}) => {
      const result = utils.toHTML5keyvals([input]);
      expect(result).toEqual([expected]);
    });
  });


  describe('utils.validInkscapeVersion', () => {
    let inkscapeVersionStr;
    let execSyncMock;
    let inkscapeExists;
    let commandExistsMock;
    beforeEach( () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      inkscapeVersionStr = 'Inkscape 1.2.2 (b0a8486541, 2022-12-01)\n';
      // Using CJS require statement here, otherwise this doesn't work. If
      // 'child_process' is imported into this file, it will only be mocked
      // here, and not in '../lib/utils.js'.
      execSyncMock = jest.spyOn(require('child_process'), 'execSync')
          .mockImplementation( (cmd) => {
            return Buffer.from(inkscapeVersionStr, 'utf-8');
          });
      inkscapeExists = true;
      // Same here.
      commandExistsMock = jest.spyOn(require('command-exists'), 'sync')
          .mockImplementation( (cmd) => {
            return inkscapeExists;
          });
    });
    afterEach( () => jest.restoreAllMocks());

    it('returns true if version is valid', () => {
      expect(utils.validInkscapeVersion()).toEqual(true);
      expect(execSyncMock).toHaveBeenCalledWith('inkscape --version');
    });

    it('returns false if version is invalid', () => {
      inkscapeVersionStr = 'Inkscape 0.47\n';
      expect(utils.validInkscapeVersion()).toEqual(false);
      expect(execSyncMock).toHaveBeenCalledWith('inkscape --version');
    });

    it('returns false if Inkscape is not installed', () => {
      inkscapeExists = false;
      expect(utils.validInkscapeVersion()).toEqual(false);
      expect(commandExistsMock).toHaveBeenCalledWith('inkscape');
    });
  });
});


describe('resize', () => {
  const widthMM = 210;
  const heightMM = 297;
  const aspectRatio = widthMM / heightMM;
  const svg = `<svg width="${widthMM}mm" height="${heightMM}mm"></svg>`;
  let svgDOM;

  beforeEach( () => svgDOM = utils.createDOM(svg));

  it('converts units to `em`', () => {
    resize(svgDOM, {});
    const widthPX = utils.round(widthMM * 0.1 * 37.8);
    const heightPX = utils.round(heightMM * 0.1 * 37.8);
    expect(svgDOM.querySelector('svg').getAttribute('width'))
        .toEqual(utils.round(widthPX / 16) + 'em');
    expect(svgDOM.querySelector('svg').getAttribute('height'))
        .toEqual(utils.round(heightPX / 16) + 'em');
  });

  it('applies width', () => {
    resize(svgDOM, {width: '1.5in'});
    expect(svgDOM.querySelector('svg').getAttribute('width')).toEqual('1.5in');
    expect(svgDOM.querySelector('svg').getAttribute('height'))
        .toEqual(utils.round(1.5 / aspectRatio) + 'in');
  });

  it('applies height', () => {
    resize(svgDOM, {height: '1.5in'});
    expect(svgDOM.querySelector('svg').getAttribute('width'))
        .toEqual(utils.round(1.5 * aspectRatio) + 'in');
    expect(svgDOM.querySelector('svg').getAttribute('height')).toEqual('1.5in');
  });

  it('applies width and height', () => {
    resize(svgDOM, {width: '1inch', height: '2inch'});
    expect(svgDOM.querySelector('svg').getAttribute('width')).toEqual('1in');
    expect(svgDOM.querySelector('svg').getAttribute('height')).toEqual('2in');
  });

  it('excludes SVGs with mixed relative/absolute units', () => {
    const svg = '<svg width="50%" height="50mm"></svg>';
    const svgDOM = utils.createDOM(svg);
    resize(svgDOM, {});
    expect(svgDOM.querySelector('svg').outerHTML).toEqual(svg);
  });

  it('leaves SVG unmodified when given invalid height/width', () => {
    resize(svgDOM, {height: "50ducks"});
    expect(svgDOM.querySelector('svg').outerHTML).toEqual(svg);
  });
});


describe('optimize', () => {
  describe('optimize.svgo', () => {
    const svg = utils.loadSVG('tests/example-math.svg');
    const optimizedSVG = optimize.svgo({svgString: svg});

    it('optimizes Inkscape SVG', () => {
      expect(optimizedSVG.length).toBeLessThan(svg.length);
      console.log('SVGO achieves a compression of ' +
                  `${(100*(1 - optimizedSVG.length / svg.length))
                      .toPrecision(3)}% ` +
                  'when optimizing `tests/example-math.svg`.');
    });

    // This test checks if the SVGO version used produces the exact same SVG
    // file as SVGO version 3.0.2 (for bumping versions of SVGO).
    test('svgo@currentVersion produces same SVG as svgo@3.0.2', () => {
      const svgFromSVGOatCurrent = optimizedSVG;
      // eslint-disable-next-line camelcase
      const svgFromSVGOat3_0_2 =
          utils.loadSVG('tests/example-math-svgo-3-0-2.svg');
      expect(svgFromSVGOatCurrent).toEqual(svgFromSVGOat3_0_2);
    });
  });

  describe('optimize.removeTranslations', () => {
    it('removes `translate(...)`', () => {
      const svg =
        '<svg>\n' +
        '  <text x="1" y="2" transform="translate(-1 -2) scale(1 0.5)">\n' +
        '    Text.\n' +
        '    <tspan x="1" y="2">Text in tspan.</tspan>\n' +
        '  </text>\n' +
        '</svg>';

      const svgDOM = utils.createDOM(svg);

      expect(svgDOM.querySelector('text').getAttribute('transform'))
          .toBe('translate(-1 -2) scale(1 0.5)');

      optimize.removeTranslations(svgDOM);

      expect(svgDOM.querySelector('text').getAttribute('transform'))
          .toBe('scale(1 0.5)');
      expect(svgDOM.querySelector('text').getAttribute('x')).toBe('0');
      expect(svgDOM.querySelector('text').getAttribute('y')).toBe('0');
      expect(svgDOM.querySelector('tspan').getAttribute('x')).toBe('0');
      expect(svgDOM.querySelector('tspan').getAttribute('y')).toBe('0');
    });

    it('removes transform ' +
         'if it only contains `translate(...)`', () => {
      const svg =
        '<svg>\n' +
        '  <text x="1" y="2" transform="translate(-1 -2)">\n' +
        '    Text.\n' +
        '    <tspan x="1" y="2">Text in tspan.</tspan>\n' +
        '  </text>\n' +
        '</svg>';

      const svgDOM = utils.createDOM(svg);

      expect(svgDOM.querySelector('text').hasAttribute('transform'))
          .toBeTruthy();

      optimize.removeTranslations(svgDOM);

      expect(svgDOM.querySelector('text').hasAttribute('transform'))
          .toBeFalsy();
    });

    it("leaves items that don't have `x` and `y` attributes unmodified", () => {
      const svg =
        '<svg>' +
        '  <path d="M 10,10 h 10" transform="translate(-1 -2)"></path>' +
        '</svg>';

      const svgDOM = utils.createDOM(svg);
      optimize.removeTranslations(svgDOM);
      expect(svgDOM.querySelector('svg').outerHTML).toEqual(svg);
    });

    it('leaves items whose children don\'t all have' +
         '`x` and `y` attributes unmodified', () => {
      const svg =
        '<svg>\n' +
        '  <text x="1" y="2" transform="translate(-1 -2)">\n' +
        '    Text.\n' +
        '    <tspan>Text in tspan.</tspan>\n' +
        '  </text>\n' +
        '</svg>';

      const svgDOM = utils.createDOM(svg);
      optimize.removeTranslations(svgDOM);
      expect(svgDOM.querySelector('svg').outerHTML).toEqual(svg);
    });
  });

  describe('optimize.optimizeTspan', () => {
    it('removes superfluous x and y attributes', () => {
      const svg =
        '<svg>\n' +
        '  <text x="3.1416" y="2.7183">\n' +
        '    <tspan x="3.1416" y="2.7183" style="color:red">Text.</tspan>\n' +
        '  </text>\n' +
        '</svg>';
      const svgDOM = utils.createDOM(svg);

      expect(svgDOM.querySelector('tspan').hasAttribute('x')).toBeTruthy();
      expect(svgDOM.querySelector('tspan').hasAttribute('y')).toBeTruthy();
      optimize.optimizeTspan(svgDOM);
      expect(svgDOM.querySelector('tspan').hasAttribute('x')).toBeFalsy();
      expect(svgDOM.querySelector('tspan').hasAttribute('y')).toBeFalsy();
    });

    it('removes superfluous styles from <tspan>', () => {
      const svg =
        '<svg>\n' +
        '  <text x="3.1416" y="2.7183" ' +
           'style="font-family:serif;color:red;font-size:4px">\n' +
        '    <tspan x="0" y="2.7183" ' +
             'style="color:red;font-size:10px">Text.</tspan>\n' +
        '  </text>\n' +
        '</svg>';
      const svgDOM = utils.createDOM(svg);

      expect(svgDOM.querySelector('tspan')
          .style.getPropertyValue('font-size')).toBeTruthy();
      optimize.optimizeTspan(svgDOM);
      expect(svgDOM.querySelector('tspan')
          .style.getPropertyValue('color')).toBeFalsy();
    });

    it('removes superfluous `style` attribute', () => {
      const svg =
        '<svg>\n' +
        '  <text x="3.1416" y="2.7183" ' +
           'style="font-family:serif;color:red;font-size:4px">\n' +
        '    <tspan x="0" y="2.7183" ' +
             'style="color:red;font-size:4px">Text.</tspan>\n' +
        '  </text>\n' +
        '</svg>';
      const svgDOM = utils.createDOM(svg);

      expect(svgDOM.querySelector('tspan').hasAttribute('style')).toBeTruthy();
      optimize.optimizeTspan(svgDOM);
      expect(svgDOM.querySelector('tspan').hasAttribute('style')).toBeFalsy();
    });

    it('removes superfluous <tspan> element', () => {
      const svg =
        '<svg>\n' +
          '<text x="3.1416" y="2.7183" ' +
           'style="font-family:serif;color:red;font-size:4px">Text.' +
            '<tspan x="3.1416" y="2.7183" ' +
             'style="color:red;font-size:4px">Text inside tspan.</tspan>' +
          '</text>\n' +
        '</svg>';

      const svgDOM = utils.createDOM(svg);

      expect(svgDOM.querySelector('tspan')).toBeTruthy();
      optimize.optimizeTspan(svgDOM);
      expect(svgDOM.querySelector('tspan')).toBeFalsy();
      expect(svgDOM.querySelector('text').innerHTML)
          .toEqual('Text.Text inside tspan.');
    });
  });

  describe('optimize.main', () => {
    it('optimizes Inkscape SVG', () => {
      const svg = utils.loadSVG('tests/example-math.svg');
      const svgDOM = utils.createDOM(svg);
      optimize.main({svgDOM});
      const optimizedSVG = utils.serialize(svgDOM);
      expect(optimizedSVG.length).toBeLessThan(svg.length);
      console.log('optimize.main achieves a compression of ' +
                  `${(100*(1 - optimizedSVG.length / svg.length))
                      .toPrecision(3)}% ` +
                  'when optimizing `tests/example-math.svg`.');
    });
  });
});


describe('text2foreignObject', () => {
  it('replaces <text> elements with <foreignObject> elements', () => {
    const svg =
      '<svg>\n' +
        '<text x="3.1416" y="2.7183" ' +
         'style="fill:#f00;font-size:4px">$E=mc^2$' +
        '</text>\n' +
      '</svg>';

    const expectedSVG =
      '<svg>\n' +
        '<foreignObject x="3.1416" y="2.7183" width="1000" height="1" ' +
         'overflow="visible" style="font-size: 4px; ' +
           'color: rgb(255, 0, 0);">' +
          '<p style="margin-top: -80px;">' +
            '<span style="height: 80px; display: inline-block;">' +
            '</span>' +
            '<span class="math inline">\\(E=mc^2\\)</span>' +
          '</p>' +
        '</foreignObject>\n' +
      '</svg>';

    const svgDOM = utils.createDOM(svg);
    text2foreignObject(svgDOM);
    expect(svgDOM.body.innerHTML).toEqual(expectedSVG);
  });

  it('removes empty text element', () => {
    const svg =
      '<svg>\n' +
        '<text x="3.1416" y="2.7183" ' +
         'style="fill:#f00;font-size:4px">' +
        '</text>\n' +
      '</svg>';
    const svgDOM = utils.createDOM(svg);
    text2foreignObject(svgDOM);
    expect(svgDOM.querySelector('text')).toEqual(null);
  });
});


describe('svg2to11', () => {
  const svg =
    '<svg>\n' +
    '  <defs>\n' +
    '    <marker>\n' +
    '      <path style="fill:context-stroke;stroke:context-stroke" />\n' +
    '    </marker>\n' +
    '  </defs>\n' +
    '</svg>';

  it.each`
      prop
      ${'fill'}
      ${'stroke'}
    `("replaces `$prop:context-stroke`",
      ({prop}) => {
        const svgDOM = utils.createDOM(svg);
        const containsPropEqualsContextStroke = (prop) => {
          return Array.from( svgDOM.querySelectorAll('marker [style]'),
              (node) => node.style.getPropertyValue(prop) === 'context-stroke' )
              .includes(true);
        };
        expect(containsPropEqualsContextStroke(prop)).toBeTruthy();
        svg2to11(svgDOM);
        expect(containsPropEqualsContextStroke(prop)).toBeFalsy();
      });
});


describe.skip('transforms', () => {
  const matrix2arr = (matrix) => {
    return [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
  };

  describe('transformMatrix', () => {
    it('consolidates transforms', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '  <g transform="translate(5, 10)">' +
        '    <g transform="translate(5, 10)">' +
        '      <path />' +
        '    </g>' +
        '  </g>' +
        '</svg>';

      const svgDOM = utils.createDOM(svg);
      matrix = transforms.transformMatrix(svgDOM.querySelector('path'));
      expect(matrix2arr(matrix)).toEqual([0, 0, 0, 0, 10, 20]);
    });
  });

  describe('calcTransforms', () => {

  });

  describe('maxLocalDim', () => {

  });
});


describe('filter', () => {
  afterEach( () => {
    jest.restoreAllMocks();
  });

  const imageContent = ({
    id = '',
    classes = ['class1', 'class2'],
    keyvals = [],
    fname = './tests/example-math.svg',
    fig = false,
  } = {} ) => {
    const title = fig ? 'fig:' : '';
    return [
      [id, classes, keyvals],
      [{'t': 'Str', 'c': 'Caption'}],
      [fname, title],
    ];
  };

  const args = ({
    key = 'Image',
    val = imageContent(),
    format = 'html',
    meta = {},
  } = {}) => {
    return [{t: key, c: val}, format, meta];
  };

  // Convert RawInline/RawBlock Pandoc AST element to an SVG DOM
  const raw2DOM = (raw) => utils.createDOM(raw.c[1]);

  it('returns undefined if output format is not supported', () => {
    expect(filter(...args({format: 'docx'}))).toEqual(undefined);
  });

  it("returns `undefined` if `key` is not 'Image'", () => {
    expect(filter(...args({key: 'Str'}))).toBeUndefined();
  });

  it('returns `undefined` if image is not an SVG', () => {
    expect(filter(...args({val: imageContent({fname: 'not-an-svg.png'})})))
        .toBeUndefined();
  });

  it("returns Image if it has class 'ignore'", () => {
    const image = filter(...args({val: imageContent({classes: ['ignore']})}));
    expect(image).toMatchObject({t: 'Image', c: imageContent({classes: []})});
  });

  it("returns figure if Image has class 'ignore' and is a figure", () => {
    const figure = filter(...args({
      key: 'Para',
      val: [{
        't': 'Image',
        'c': imageContent({
          classes: ['ignore'], fig: true,
        }),
      }],
    }));
    expect(figure).toMatchObject({t: 'Para', c: [{
      't': 'Image',
      'c': imageContent({classes: [], fig: true}),
    }]});
  });

  it('returns `undefined` if the SVG cannot be found', () => {
    // Suppress console.error() output.
    const stderr = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(filter(...args({val: imageContent({fname: 'non-existant.svg'})})))
        .toBeUndefined();
    expect(stderr).toHaveBeenCalled();
  });

  it('returns a `RawInline` when passed an SVG', () => {
    expect(filter(...args())).toMatchObject({t: 'RawInline'});
  });

  it('returns `RawBlock` which contains SVG', () => {
    expect(raw2DOM(filter(...args())).querySelector('svg')).toBeTruthy();
  });

  it('applies width to SVG when provided', () => {
    const rawInline = filter(
        ...args({val: imageContent({keyvals: [['width', '50%']]})}));
    expect(raw2DOM(rawInline).querySelector('svg').getAttribute('width'))
        .toBe('50%');
  });

  it('applies `scaleFactor`', () => {
    const svg = '<svg width="2em" height="1em"></svg>';
    const loadSVGmock =
        jest.spyOn(utils, 'loadSVG').mockImplementation( () => svg);
    const rawInline = filter(
        ...args({val: imageContent({
          keyvals: [['scale-factor', '2'], ['key', 'val']],
        })}),
    );
    expect(loadSVGmock).toHaveBeenCalled();
    expect(raw2DOM(rawInline).querySelector('svg').getAttribute('width'))
        .toBe('4em');
    expect(raw2DOM(rawInline).querySelector('svg').getAttribute('height'))
        .toBe('2em');
  });

  it('excludes SVGs with class `keep-size`', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" ' +
                'width="42mm" height="42mm"></svg>';
    const loadSVGmock =
        jest.spyOn(utils, 'loadSVG').mockImplementation( () => svg);
    const rawInline =
        filter(...args({val: imageContent({classes: ['keep-size']})}));
    expect(loadSVGmock).toHaveBeenCalled();
    expect(raw2DOM(rawInline).querySelector('svg').outerHTML).toEqual(svg);
  });

  it("returns <figure> when passed a figure", () => {
    const rawBlock = filter(...args({
      key: 'Para',
      val: [{
        't': 'Image',
        'c': imageContent({
          fig: true, keyvals: ['key', 'val'],
        }),
      }],
    }));
    expect(raw2DOM(rawBlock).querySelector('figure').outerHTML).toBeTruthy();
  });

  it('applies id to svg', () => {
    const svg = '<svg width="42mm" height="42mm"></svg>';
    const loadSVGmock =
        jest.spyOn(utils, 'loadSVG').mockImplementation( () => svg);
    const rawInline = filter(...args({val: imageContent({id: 'id'})}));
    expect(raw2DOM(rawInline).querySelector('svg').id).toBe('id');
    expect(loadSVGmock).toHaveBeenCalled();
  });
});


describe('pandoc-svg', () => {
  const pandocSVGinstalled = () => {
    if (commandExists('pandoc-svg')) {
      return true;
    } else {
      return 'Command `pandoc-svg` is not available. Did you run `npm link` ' +
             'in the root directory of the package?';
    }
  };

  test('pandoc-svg is installed', () => {
    expect(pandocSVGinstalled()).toEqual(true);
  });

  test('pandoc-svg integration test', () => {
    execSync('pandoc tests/test.md -o tests/test.html ' +
             '-f markdown -t html --standalone --filter pandoc-svg');
    console.log('Please examine the file `tests/test.html` in a browser.');
  });
});
