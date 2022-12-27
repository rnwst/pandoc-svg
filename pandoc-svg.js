#!/usr/bin/env node

'use strict';

import {stdio as toJSONfilter} from 'pandoc-filter';
import filter from './lib/filter.js';


toJSONfilter(filter);
