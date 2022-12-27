'use strict';

import {round} from './utils.js';

/**
 * Resize SVG `width` and `height` units to `em`. No unit implies `px`.
 * If `dimObject` contains `width` or `height`, apply those values instead,
 * maintaining aspect ratio. If the SVG is already sized in relative units,
 * only apply `scaleFactor`.
 * @param {object} svgDOM - SVG DOM
 * @param {object} dimObj - Object containing information for dimensioning
 */
export default function resize(svgDOM, dimObj) {
  let {scaleFactor, width, height} = dimObj;

  if (typeof scaleFactor === 'undefined') {
    scaleFactor = 1;
  }

  const dimRegex = /^(?<val>[\d\.]+)(?<unit>[^\d\.]*)$/;

  // For a unit reference, see:
  // https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/Values_and_units
  const abs2PX = {
    '': 1,
    'px': 1,
    'cm': 37.8,
    'mm': 0.1 * 37.8,
    'in': 96,
    'pt': 1/72 * 96,
    'pc': 1/6 * 96,
    'Q': 1/40 * 37.8,
  };

  const relUnits = new Set([
    'em', 'ex', 'ch', 'rem', 'lh', 'rlh', 'vw', 'vh', 'vmin', 'vmax', 'vb',
    'vi', 'svw', 'svh', 'lvw', 'lvh', 'dvw', 'dvh',
  ]);

  const dimValid = (dim) => {
    const match = dimRegex.exec(dim);
    return (match &&
        (match.groups.unit in abs2PX || relUnits.has(match.groups.unit)));
  };

  const svgWidthStr = svgDOM.querySelector('svg').getAttribute('width');
  const svgHeightStr = svgDOM.querySelector('svg').getAttribute('height');

  // SVG must have valid width and height specified.
  if (!dimValid(svgWidthStr) || !dimValid(svgHeightStr)) {
    return;
  }

  const svgWidthUnit = dimRegex.exec(svgWidthStr).groups.unit;
  const svgWidthVal = Number(dimRegex.exec(svgWidthStr).groups.val);

  const svgHeightUnit = dimRegex.exec(svgHeightStr).groups.unit;
  const svgHeightVal = Number(dimRegex.exec(svgHeightStr).groups.val);

  const applyWidthHeight = (width, height) => {
    svgDOM.querySelector('svg').setAttribute('width', width);
    svgDOM.querySelector('svg').setAttribute('height', height);
  };

  // If either of the SVG's units are relative, apply scale factor and return.
  if (relUnits.has(svgWidthUnit) || relUnits.has(svgHeightUnit)) {
    const newSVGwidthStr = round(scaleFactor * svgWidthVal) + svgWidthUnit;
    const newSVGheightStr = round(scaleFactor * svgHeightVal) + svgHeightUnit;
    applyWidthHeight(newSVGwidthStr, newSVGheightStr);
    return;
  }

  const svgWidthInPX = round(svgWidthVal * abs2PX[svgWidthUnit]);
  const svgHeightInPX = round(svgHeightVal * abs2PX[svgHeightUnit]);

  // If neither width nor height are supplied to resize, convert to `em`.
  if (typeof width === 'undefined' && typeof height === 'undefined') {
    const newSVGwidthStr = round(scaleFactor * svgWidthInPX / 16) + 'em';
    const newSVGheightStr = round(scaleFactor * svgHeightInPX / 16) + 'em';
    applyWidthHeight(newSVGwidthStr, newSVGheightStr);
    return;
  }

  // Pandoc allows the following units: `px`, `cm`, `mm`, `in`, `inch`, `%`.
  // See https://pandoc.org/MANUAL.html#extension-link_attributes.
  // Of these units, only `inch` is not a valid CSS unit.
  const pandocDimValid = (dim) => {
    const match = dimRegex.exec(dim);
    return (match &&
        ['px', 'cm', 'mm', 'in', 'inch', '%'].includes(match.groups.unit) );
  };

  let newSVGwidthStr;
  let newSVGheightStr;
  const aspectRatio = svgWidthInPX / svgHeightInPX;

  if (typeof width === 'undefined') {
    if (!pandocDimValid(height)) {
      return;
    }
    height = height.replace('inch', 'in');
    newSVGheightStr = height;
    const heightMatch = dimRegex.exec(height);
    newSVGwidthStr = round( Number(heightMatch.groups.val) * aspectRatio ) +
        heightMatch.groups.unit;
    applyWidthHeight(newSVGwidthStr, newSVGheightStr);
    return;
  }

  if (typeof height === 'undefined') {
    if (!pandocDimValid(width)) {
      return;
    }
    width = width.replace('inch', 'in');
    newSVGwidthStr = width;
    const widthMatch = dimRegex.exec(width);
    newSVGheightStr = round( Number(widthMatch.groups.val) / aspectRatio ) +
        widthMatch.groups.unit;
    applyWidthHeight(newSVGwidthStr, newSVGheightStr);
    return;
  }

  // Both width and height are specified.
  if (!pandocDimValid(width) || !pandocDimValid(height)) {
    return;
  }
  width = width.replace('inch', 'in');
  height = height.replace('inch', 'in');
  newSVGwidthStr = width;
  newSVGheightStr = height;
  applyWidthHeight(newSVGwidthStr, newSVGheightStr);
}
