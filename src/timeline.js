'use strict';

import React, {Component} from 'react';
import PropTypes from 'prop-types';
import {Grid, AutoSizer} from 'react-virtualized';

import moment from 'moment';
import interact from 'interactjs';
import _ from 'lodash';

import {sumStyle, pixToInt, intToPix} from 'utils/common';
import {rowItemsRenderer, getTimeAtPixel, getNearestRowHeight, getMaxOverlappingItems} from 'utils/itemUtils';
import {groupRenderer} from 'utils/groupUtils';

import Timebar from 'components/timebar';
import './style.css';

const ITEM_HEIGHT = 40;

const VISIBLE_START = moment('2000-01-01');
const VISIBLE_END = VISIBLE_START.clone().add(1, 'days');

export default class Timeline extends Component {
  static propTypes = {
    items: PropTypes.arrayOf(PropTypes.object).isRequired,
    groups: PropTypes.arrayOf(PropTypes.object).isRequired,
    renderGroups: PropTypes.bool
  };
  static defaultProps = {
    renderGroups: true
  };

  constructor(props) {
    super(props);
    this.state = {selection: []};
    this.setTimeMap(this.props.items);

    this.cellRenderer = this.cellRenderer.bind(this);
    this.rowHeight = this.rowHeight.bind(this);
    this.setTimeMap = this.setTimeMap.bind(this);
    this.changeGroup = this.changeGroup.bind(this);
    this.setSelection = this.setSelection.bind(this);
    this.clearSelection = this.clearSelection.bind(this);
    this.getTimelineWidth = this.getTimelineWidth.bind(this);
    this._itemRowClickHandler = this._itemRowClickHandler.bind(this);
    this.setUpDragging();
  }

  componentWillReceiveProps(nextProps) {
    this.setTimeMap(nextProps.items);
  }

  setTimeMap(items) {
    this.itemRowMap = {}; // timeline elements (key) => (rowNo).
    this.rowItemMap = {}; // (rowNo) => timeline elements
    this.rowHeightCache = {}; // (rowNo) => max number of stacked items
    let visibleItems = _.filter(items, i => {
      return i.end > VISIBLE_START && i.start < VISIBLE_END;
    });
    let itemRows = _.groupBy(visibleItems, 'row');
    _.forEach(itemRows, (visibleItems, row) => {
      const rowInt = parseInt(row);
      if (this.rowItemMap[rowInt] === undefined) this.rowItemMap[rowInt] = [];
      _.forEach(visibleItems, item => {
        this.itemRowMap[item.key] = rowInt;
        this.rowItemMap[rowInt].push(item);
      });
      this.rowHeightCache[rowInt] = getMaxOverlappingItems(visibleItems);
    });
  }
  changeGroup(item, curRow, newRow) {
    item.row = newRow;
    this.itemRowMap[item.key] = newRow;
    this.rowItemMap[curRow] = this.rowItemMap[curRow].filter(i => i.key !== item.key);
    this.rowItemMap[newRow].push(item);
  }
  setSelection(start, end) {
    this.setState({selection: [{start: start.clone(), end: end.clone()}]});
  }
  clearSelection() {
    this.setState({selection: []});
  }
  getTimelineWidth() {
    return this._grid.props.width - 100; //HACK: This is the sidebar width
  }
  setUpDragging() {
    interact('.item_draggable').draggable({
      onstart: e => {
        e.target.style['z-index'] = 2;
        //TODO: This should use state reducer
        //TODO: Should be able to optimize the lookup below
        const index = e.target.getAttribute('item-index');
        const rowNo = this.itemRowMap[index];
        const itemIndex = _.findIndex(this.rowItemMap[rowNo], i => i.key == index);
        const item = this.rowItemMap[rowNo][itemIndex];
        this.setSelection(item.start, item.end);
      },
      onmove: e => {
        e.target.style.left = sumStyle(e.target.style.left, e.dx);
        let curTop = e.target.style.top ? e.target.style.top : '0px';
        e.target.style.top = sumStyle(curTop, e.dy);
        const index = e.target.getAttribute('item-index');
        const rowNo = this.itemRowMap[index];
        const itemIndex = _.findIndex(this.rowItemMap[rowNo], i => i.key == index);
        const item = this.rowItemMap[rowNo][itemIndex];
        let itemDuration = item.end.diff(item.start);
        let newStart = getTimeAtPixel(
          pixToInt(e.target.style.left),
          VISIBLE_START,
          VISIBLE_END,
          this.getTimelineWidth()
        );
        let newEnd = newStart.clone().add(itemDuration);
        this.setSelection(newStart, newEnd);
      },
      onend: e => {
        const index = e.target.getAttribute('item-index');
        const rowNo = this.itemRowMap[index];
        const itemIndex = _.findIndex(this.rowItemMap[rowNo], i => i.key == index);
        const item = this.rowItemMap[rowNo][itemIndex];
        if (item === undefined) debugger;
        this.clearSelection();
        // Change row (TODO)
        console.log('From ' + rowNo);
        let newRow = getNearestRowHeight(e.clientX, e.clientY);
        console.log('To ' + newRow);
        this.changeGroup(item, rowNo, newRow);
        // Update time
        let itemDuration = item.end.diff(item.start);
        let newStart = getTimeAtPixel(
          pixToInt(e.target.style.left),
          VISIBLE_START,
          VISIBLE_END,
          this.getTimelineWidth()
        );
        console.log(e.target.style.left, newStart);
        let newEnd = newStart.clone().add(itemDuration);
        item.start = newStart;
        item.end = newEnd;
        console.log('New start: ' + newStart.format());
        //reset styles
        e.target.style['z-index'] = 1;
        e.target.style['top'] = intToPix(ITEM_HEIGHT * Math.round(pixToInt(e.target.style['top']) / ITEM_HEIGHT));
        // e.target.style['top'] = '0px';
        // Check row height doesn't need changing
        let need_recompute = false;
        let new_to_row_height = getMaxOverlappingItems(this.rowItemMap[newRow], VISIBLE_START, VISIBLE_END);
        if (new_to_row_height !== this.rowHeightCache[newRow]) {
          this.rowHeightCache[newRow] = new_to_row_height;
          need_recompute = true;
        }
        let new_from_row_height = getMaxOverlappingItems(this.rowItemMap[rowNo], VISIBLE_START, VISIBLE_END);
        if (new_from_row_height !== this.rowHeightCache[rowNo]) {
          this.rowHeightCache[rowNo] = new_from_row_height;
          need_recompute = true;
        }
        if (need_recompute) this._grid.recomputeGridSize({rowIndex: Math.min(newRow, rowNo)});
        else this._grid.forceUpdate();
      }
    });
  }
  _itemRowClickHandler(e) {
    if (e.target.hasAttribute('item-index') || e.target.parentElement.hasAttribute('item-index')) {
      // console.log('Clicking item');
    } else {
      let row = e.target.getAttribute('row-index');
      let clickedTime = getTimeAtPixel(e.clientX, VISIBLE_START, VISIBLE_END, this.getTimelineWidth());
      // console.log('Clicking row ' + row + ' at ' + clickedTime.format());
    }
  }
  /**
   * @param  {} width container width (in px)
   */
  cellRenderer(width) {
    /**
     * @param  {} columnIndex Always 1
     * @param  {} key Unique key within array of cells
     * @param  {} parent Reference to the parent Grid (instance)
     * @param  {} rowIndex Vertical (row) index of cell
     * @param  {} style Style object to be applied to cell (to position it);
     */
    return ({columnIndex, key, parent, rowIndex, style}) => {
      let itemCol = this.props.renderGroups ? 1 : 0;
      if (itemCol == columnIndex) {
        let itemsInRow = this.rowItemMap[rowIndex];
        return (
          <div key={key} style={style} row-index={rowIndex} className="rct9k-row" onClick={this._itemRowClickHandler}>
            {rowItemsRenderer(itemsInRow, VISIBLE_START, VISIBLE_END, width, ITEM_HEIGHT)}
          </div>
        );
      } else {
        let group = _.find(this.props.groups, g => g.id == rowIndex);
        return (
          <div key={key} style={style} className="rct9k-group">
            {groupRenderer(group)}
          </div>
        );
      }
    };
  }

  rowHeight({index}) {
    return this.rowHeightCache[index] * ITEM_HEIGHT;
  }

  render() {
    const {renderGroups} = this.props;
    const columnCount = renderGroups ? 2 : 1;

    function columnWidth(width) {
      return ({index}) => {
        if (columnCount == 1) return width;
        if (columnCount == 2) {
          let groupWidth = 100;

          if (index == 0) return groupWidth;
          return width - groupWidth;
        }
      };
    }

    return (
      <div className="rct9k-timeline-div">
        <AutoSizer>
          {({height, width}) => (
            <div>
              <Timebar
                start={VISIBLE_START}
                end={VISIBLE_END}
                width={width}
                leftOffset={100}
                selectedRanges={this.state.selection}
              />
              <Grid
                ref={ref => (this._grid = ref)}
                autoContainerWidth
                cellRenderer={this.cellRenderer(width)}
                columnCount={columnCount}
                columnWidth={columnWidth(width)}
                height={height}
                rowCount={this.props.groups.length}
                rowHeight={this.rowHeight}
                width={width}
              />
            </div>
          )}
        </AutoSizer>
      </div>
    );
  }
}
