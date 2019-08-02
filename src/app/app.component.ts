import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import ResizeObserver from 'resize-observer-polyfill';
import * as boxIntersect from 'box-intersect';
import * as uuid from 'uuid';

import {
  trigger,
  state,
  style,
  animate,
  transition,
} from '@angular/animations';
import { CdkDrag } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  animations: [
    trigger('drag-drop', [
      state('none', style({
        transform: 'translate({{translate_X}}px, {{translate_Y}}px)',
      }), { params: { translate_X: 0, translate_Y: 0 } }),
      state('dropped', style({
        transform: 'translate(0px, 0px)',
      })),
      transition('* => dropped', [
        animate('0.1s'),
      ]),
    ])
  ]
})
export class AppComponent implements AfterViewInit, OnDestroy {

  dragEnded = false;

  pos: { x: number, y: number } = { x: 0, y: 0 };

  index: {
    rowStart: number,
    rowEnd: number,
    columnStart: number,
    columnEnd: number
  } = { rowStart: 1, rowEnd: 3, columnStart: 1, columnEnd: 1 };

  readonly maxRowIndex = 30;
  readonly maxColIndex = 6;

  readonly rows = [...Array(this.maxRowIndex).keys()].map(_ => `rowid_${uuid.v4()}`);
  readonly cols = [...Array(this.maxColIndex).keys()].map(_ => `colid_${uuid.v4()}`);

  private readyToAnimation = false;

  private readonly resizeObserver = new ResizeObserver(entries => this.resized$.next(entries));
  private readonly resized$ = new Subject<ResizeObserverEntry[]>();

  private readonly rowsCoordsMap = new Map<string, number[]>();
  private readonly colsCoordsMap = new Map<string, number[]>();

  ngAfterViewInit(): void {
    this.resizeObserver.observe(document.querySelector('.container'));
    this.calcAxisCoords();

    this.resized$.pipe(debounceTime(500)).subscribe(_ => this.calcColsAxisCoords());
    this.animationLoop();
  }

  animationLoop() {
    window.requestAnimationFrame(() => this.animationLoop());
    if (!this.readyToAnimation) { return; }
    this.dragEnded = true;
    this.readyToAnimation = false;
  }

  dragStarted(event: { source: CdkDrag }) {
    const drag: CdkDrag = event.source;
    drag.reset();
    this.pos = { x: 0, y: 0 };
    this.dragEnded = false;
  }

  dragDropped(event: { source: CdkDrag }) {
    const drag = event.source;
    drag.reset();

    const { left, top, center } = this.calcCenter(drag.element.nativeElement);
    const { row, col } = this.updateIndices(center);

    const [destCoordX, destCoordY] = [
      this.colsCoordsMap.get(this.cols[col - 1])[0],
      this.rowsCoordsMap.get(this.rows[row - 1])[1]
    ];

    this.pos = {
      x: left + this.pos.x - destCoordX,
      y: top + this.pos.y - destCoordY
    };

    this.readyToAnimation = true;
  }

  dragMoved(event: { distance: { x: number, y: number } }) {
    this.pos = event.distance;
  }

  private calcCenter(el: HTMLElement): { left: number, top: number, center: number[] } {
    const { left, top, right, bottom } = el.getBoundingClientRect();
    const rowSpan = this.index.rowEnd - this.index.rowStart;

    const [horizontalCenter, verticalCenter] = [
      (left + right) * .5 + this.pos.x,
      (bottom - top) / rowSpan * .5 + top + this.pos.y
    ];

    return ({
      left, top,
      center: [
        horizontalCenter, verticalCenter,
        horizontalCenter, verticalCenter
      ]
    });
  }

  private createCoordsArray(idArray: string[], coordsMap: Map<string, number[]>): number[][] {
    return [[0, 0, 0, 0]].concat(idArray.map(id => coordsMap.get(id)));
  }

  private intersectArrayIndex(coordsArray: number[][]): number {
    return Math.min(
      ...(boxIntersect(coordsArray) as number[][])
        .filter(x => x.find(y => y === 0) !== void (0))
        .reduce((acc, x) => acc.concat(x), [])
        .filter(x => x !== 0));
  }

  private calcAxisCoords() {
    this.calcRowsAxisCoords();
    this.calcColsAxisCoords();
  }

  private calcRowsAxisCoords() {
    this.updateCoordsMap(this.rows, this.rowsCoordsMap);
  }

  private calcColsAxisCoords() {
    this.updateCoordsMap(this.cols, this.colsCoordsMap);
  }

  private updateCoordsMap(idArray: string[], coordsMap: Map<string, number[]>): void {
    for (const id of idArray) {
      const el = document.querySelector(`#${id}`) as HTMLElement;
      const { left, top, right, bottom } = el.getBoundingClientRect();
      coordsMap.set(id, [left, top, right, bottom]);
    }
  }

  private updateIndices(centerCoords: number[]): { row: number, col: number } {
    const [rowsAxisCoords, colsAxisCoords] = [
      this.createCoordsArray(this.rows, this.rowsCoordsMap),
      this.createCoordsArray(this.cols, this.colsCoordsMap)
    ];

    rowsAxisCoords[0] = colsAxisCoords[0] = centerCoords;

    return ({
      row: this.updateRowIndex(rowsAxisCoords),
      col: this.updateColIndex(colsAxisCoords)
    });
  }

  private updateRowIndex(rowsAxisCoords: number[][]): number {
    const nextRowStartIndex = this.intersectArrayIndex(rowsAxisCoords);
    this.index.rowEnd += nextRowStartIndex - this.index.rowStart;
    this.index.rowStart = nextRowStartIndex;
    return nextRowStartIndex;
  }

  private updateColIndex(colsAxisCoords: number[][]): number {
    const nextColStartIndex = this.intersectArrayIndex(colsAxisCoords);
    this.index.columnEnd += nextColStartIndex - this.index.columnStart;
    this.index.columnStart = nextColStartIndex;
    return nextColStartIndex;
  }

  ngOnDestroy() {
    this.resizeObserver.disconnect();
  }
}
