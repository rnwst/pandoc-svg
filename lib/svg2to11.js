'use strict';

/**
 * Convert from SVG 2 to SVG 1.1.
 * @param {object} svgDOM - SVG DOM
 */
export default function svg2to11(svgDOM) {
  svgDOM.querySelectorAll('marker [style]').forEach( (elt) => {
    if (elt.style.getPropertyValue('fill') === 'context-stroke') {
      elt.style.setProperty('fill', '#000');
    }
    if (elt.style.getPropertyValue('stroke') === 'context-stroke') {
      elt.style.setProperty('stroke', '#000');
    }
  });
}
