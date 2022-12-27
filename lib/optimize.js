'use strict';

import {optimize as svgoOptimize} from 'svgo';
import * as utils from './utils.js';

/**
 * Optimize SVG.
 * @param {object} object
 * @param {string} object.svgString - SVG contents
 * @param {boolean} object.pretty - Whether to prettify SVG
 * @return {string} - Optimized SVG contents
 */
export function svgo({svgString, pretty = false}) {
  const result = svgoOptimize(svgString, {
    js2svg: {
      indent: 2, // Number of indentation spaces.
      pretty, // Include linebreaks.
    },
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            cleanupIds: {
              // Preserve elemet Ids that begin with 'marker' or 'Arrow' (which
              // is the naming convention Inkscape appears to use). Otherwise,
              // SVGO will remove markers erroneously:
              // https://github.com/svg/svgo/issues/1725
              preservePrefixes: [
                'marker',
                'Arrow',
              ],
              // Disable minification of Ids as this is currently problematic:
              // https://github.com/svg/svgo/issues/1719
              minify: false,
            },
          },
        },
      },
    ],
  });
  const optimizedSvgString = result.data; // eslint-disable-line no-unused-vars
  return optimizedSvgString;
}

/**
 * SVGO for some reason sometimes removes layers, and applies layer transforms
 * to each element individually instead. This worsens compression ratio, as the
 * same transforms need to be repeated for each element. This function
 * eliminates translations and adds them to the respective `x` and `y`
 * attributes, provided the element and all of its children have `x` and `y`
 * attributes.
 * @param {object} svgDOM - SVG DOM
 */
export function removeTranslations(svgDOM) {
  const translateRegex = /\s*translate\((?<x>[-\d\.]*)\s+?(?<y>[-\d\.]*)\)\s*/;

  const hasXY = (elt) => {
    return (elt.hasAttribute('x') && elt.hasAttribute('y'));
  };

  const allChildrenHaveXY = (children) => {
    for (const child of children) {
      if (!hasXY(child)) {
        return false;
      }
    }
    return true;
  };

  svgDOM.querySelectorAll('[transform]').forEach( (elt) => {
    const transform = elt.getAttribute('transform');
    const match = translateRegex.exec(transform);
    if (match && hasXY(elt) && allChildrenHaveXY(elt.children)) {
      const deltaX = Number(match.groups.x);
      const deltaY = Number(match.groups.y);

      const applyTranslation = (elt) => {
        const x = Number(elt.getAttribute('x'));
        const y = Number(elt.getAttribute('y'));
        const newX = x + deltaX;
        const newY = y + deltaY;
        elt.setAttribute('x', utils.round(newX).toString());
        elt.setAttribute('y', utils.round(newY).toString());
      };

      applyTranslation(elt);
      for (const child of elt.children) {
        applyTranslation(child);
      }

      const newTransform = transform.replace(translateRegex, '');
      if (newTransform.length === 0) {
        elt.removeAttribute('transform');
      } else {
        elt.setAttribute('transform', newTransform);
      }
    }
  });
}

/**
 * Remove superfluous attributes in `<tspan>` elements. If no attributes are
 * left, replace the element with its contents.
 * @param {object} svgDOM - SVG DOM
 */
export function optimizeTspan(svgDOM) {
  svgDOM.querySelectorAll('tspan').forEach( (node) => {
    if ( (node.getAttribute('x') === node.parentNode.getAttribute('x')) &&
         (node.getAttribute('y') === node.parentNode.getAttribute('y')) ) {
      node.removeAttribute('x');
      node.removeAttribute('y');
    }
    const stylesToBeRemoved = [];
    for (let index = 0; index < node.style.length; index++) {
      const prop = node.style.item(index);
      if ( ( node.style.getPropertyValue(prop) ===
             node.parentNode.style.getPropertyValue(prop) ) &&
           ( node.style.getPropertyPriority(prop) ===
             node.parentNode.style.getPropertyPriority(prop) ) ) {
        stylesToBeRemoved.push(prop);
      }
    }
    stylesToBeRemoved.forEach( (prop) => node.style.removeProperty(prop) );
    if (node.style.length === 0) {
      node.removeAttribute('style');
    }
    if (!node.hasAttributes()) {
      node.replaceWith(node.innerHTML);
    }
  });
}

/**
 * Optimize SVG.
 * @param {object} object
 * @param {object} object.svgDOM - SVG DOM
 * @param {boolean} object.pretty - Whether to prettify SVG
 */
export function main({svgDOM, pretty = false}) {
  // Optimize using SVGO.
  const svgString = svgo({
    svgString: utils.serialize(svgDOM),
    pretty,
  });
  svgDOM.querySelector('svg').outerHTML = svgString;

  // Perform further optimizations.
  removeTranslations(svgDOM);
  optimizeTspan(svgDOM);
}
