/*
 *  Power BI Visual CLI
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */
'use strict';

import 'core-js/stable';
import './../style/visual.less';
import powerbi from 'powerbi-visuals-api';
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import DataView = powerbi.DataView;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

import * as d3 from 'd3';
type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;

import { VisualSettings, percentageSettings } from './settings';
export class Visual implements IVisual {
  private target: HTMLElement;
  private updateCount: number;
  private settings: VisualSettings;
  private textNode: Text;

  private host: IVisualHost;
  private svg: Selection<SVGElement>;
  private container: Selection<SVGElement>;
  private circle: Selection<SVGElement>;
  private textValue: Selection<SVGElement>;
  private textLabel: Selection<SVGElement>;

  // https://community.powerbi.com/t5/Custom-Visuals-Development/Custom-visual-development-issue-rendering-font-quot-DIN-quot/td-p/766692
  // https://community.powerbi.com/t5/Custom-Visuals-Development/How-to-change-fontSize-capability-limits/td-p/495920

  constructor(options: VisualConstructorOptions) {
    console.log('Visual constructor', options);
    this.target = options.element;
    this.updateCount = 0;

    if (document) {
      let table_box: HTMLElement = document.createElement('div');
      this.target.appendChild(table_box);


      const new_p: HTMLElement = document.createElement('p');
      new_p.appendChild(document.createTextNode('Please add two categorical variables and a count variable.'));
      // const new_em: HTMLElement = document.createElement('em');
      // this.textNode = document.createTextNode(this.updateCount.toString());
      // new_em.appendChild(this.textNode);
      // new_p.appendChild(new_em);
      this.target.appendChild(new_p);
    }
  }

  public update(options: VisualUpdateOptions) {
    console.log('update');
    this.settings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);
    console.log('Visual update', options);
    console.log('settings', this.settings);
    // if (this.textNode) {
    //   this.textNode.textContent = JSON.stringify(
    //     options.dataViews[0].categorical.categories[0].values,
    //     null,
    //     2
    //   ).toString();
    // }
    /* Y value ordering is located in: categorical.categories[0].values 
       X value names are in categorical.values[0-4].source.groupName
       X value counts are in categorical.values[0-4].values
    */
    let data : any = Visual.parseData(options.dataViews[0].categorical, this.settings.percentages);
    console.log('data', data);
    this.target.innerHTML = '';
    // this.target.setAttribute('style', `
    //   overflow: scroll;
    // `)
    let table: HTMLElement = document.createElement('table');
    data.forEach(row => {
      let thisRow = document.createElement('tr');
      row.forEach(cell => {
        if (cell.skip) return;
        let thisCell : HTMLElement = document.createElement('td');
        if (cell.rowspan) thisCell.setAttribute('rowspan', cell.rowspan);
        if (cell.colspan) thisCell.setAttribute('colspan', cell.colspan);
        let cellContent : Text = document.createTextNode(cell.content)
        thisCell.appendChild(cellContent);
        thisCell.setAttribute('style', cell.style);
        thisRow.appendChild(thisCell);
      });
      table.appendChild(thisRow);
    });
    table.setAttribute('style', `
      font-size: ${this.settings.fonts.fontSize}pt;
      font-family: ${this.settings.fonts.fontFamily};
      vertical-align: top;
      border: 1px solid black;
      width: 100%;
      height: 100%;
    `);
    table.setAttribute('cellspacing', '0px')
    table.setAttribute('cellpadding', '3px')
    this.target.appendChild(table);
  }

  private static reduceCategories = []

  private static parseData(cat: any, settings: percentageSettings): any {
    console.log('getting data', cat);
    let data : object = {};
    data["numCols"] = cat.categories[0].values.length;
    data["numRows"] = cat.values.length;
    let colOrder = cat.categories[0].values;
    // let colReordered = cat.categories[0].values.sort();
    data["colOrder"] = colOrder;
    // data["colReordered"] = colReordered;

    let colReordered = [...colOrder]
    data['colReordered'] = colReordered.sort();
    data["values"] = cat.values.map((x: any) => {
      return data['colReordered'].map((c: any) => {
       return x.values[data["colOrder"].indexOf(c)];
      });
    });
    data["vars"] = [];
    data["vars"].push(cat.values.source.displayName);
    data["vars"].push(cat.categories[0].source.displayName);
    data["rows"] = data["values"].length + 3;
    data["columns"] = data["values"][0].length + 4;
    data["rowTotals"] = data["values"].map(x => x.reduce(this.sum));
    data["colTotals"] = data["values"][0].map((x, i) => {
      return data["values"].reduce((t, j) => {
        let newt: number = 0;
        if (typeof t == 'object' && t !== null) {
          newt = t[i];
        } else if (t !== null) {
          newt = t;
        }
        if (j[i]) {
          return newt + j[i];
        } else {
          return newt;
        }
      });
    });
    data['overallTotal'] = data['rowTotals'].reduce(this.sum);
    let output = [];
    let includeRowPct = settings.row;
    let includeColPct = settings.column;
    let includeTotalPct = settings.total;
    let rowMultiplier : number = 1;
    if (includeRowPct) rowMultiplier++;
    if (includeColPct) rowMultiplier++;
    if (includeTotalPct) rowMultiplier++;
    let baseStyle = `
        vertical-align: top;
        border-top: 0px solid black;
        border-left: 0px solid black;
        `;
    let dataStyle = `
        vertical-align: top;
        text-align: right;
        border-top: 0px solid black;
        border-left: 0px solid black;
        `;
    const allPct = '100%';
    for (let row: number = 0; row < data["rows"]; row++) {
      let thisRow = [];
      if (row == 0) {
        /* construct top row */
        thisRow.push({
          colspan: 3,
          rowspan: 2,
          content: '',
          style: `
            vertical-align: bottom;
            border: 2px solid black;
          `
        });
        thisRow.push({skip: true});
        thisRow.push({skip: true});
        thisRow.push({
          colspan: data["colReordered"].length,
          content: data["vars"][1],
          style: `
            text-align: center;
            vertical-align: middle;
            border-top: 2px solid black;
            border-right: 1px solid black;
            border-left: 0px solid black;
            border-bottom: 1px solid black;
          `
        })
        for (let col : number = 1; col <  data["colReordered"].length; col++) {
          thisRow.push({skip: true});
        }
        thisRow.push({
          rowspan: 2,
          content: "Total",
          style: `
            vertical-align: bottom;
            text-align: center;
            border-top: 2px solid black;
            border-right: 2px solid black;
            border-left: 0px solid black;
            border-bottom: 2px solid black;
          `
        });
        output.push(thisRow);
      } else if (row == 1) {
        /*construct second row*/
        thisRow.push({skip: true});
        thisRow.push({skip: true});
        thisRow.push({skip: true});
        for (let colVal: number = 0; colVal < data["colReordered"].length; colVal++) {     
          thisRow.push({
            content: data["colReordered"][colVal],
            style: `
            vertical-align: bottom;
            text-align: center;
            border-top: 0px solid black;
            border-bottom: 2px solid black;
            border-left: 0px solid black;
            border-right: 1px solid black;
            `
          });
        }
        thisRow.push({skip: true});
        output.push(thisRow);
      } else if (row > 1 && row < data["rows"] - 1) {
        /* data rows */
        /* base data first */
        thisRow = [];
        if (row == 2) {
          thisRow.push({
            rowspan: data["values"].length * rowMultiplier,
            content: data["vars"][0],
            style: `
            vertical-align: top;
            border-top: 0px solid black;
            border-bottom: 1px solid black;
            border-left: 2px solid black;
            border-right: 0px solid black;
            `
          });
        } else {
          thisRow.push({skip: true});
        }
        thisRow.push({
          rowspan: rowMultiplier,
          content: cat.values[row - 2].source.groupName,
          style: `
          vertical-align: top;
          border-top: 0px solid black;
          border-bottom: 1px solid black;
          border-left: 0px solid black;
          border-right: 0px solid black;
          `
        });
        

        thisRow.push({
          content: 'Count',
          style : (!includeRowPct && !includeColPct && !includeTotalPct) ? 
           `${baseStyle} border-right: 2px solid black; border-bottom: 1px solid black`
          : `${baseStyle} border-right: 2px solid black; border-bottom: 0px solid black`
        });
        for (let col : number = 0; col < data["colReordered"].length; col++) {
          thisRow.push({
            content: data['values'][row-2][col] || 0,
            style : (!includeRowPct && !includeColPct && !includeTotalPct) ? 
             `${dataStyle} border-right: 1px solid black; border-bottom: 1px solid black`
            : `${dataStyle} border-right: 1px solid black; border-bottom: 0px solid black`
          });
        }
        thisRow.push({
          content: data["rowTotals"][row - 2],
          style : (!includeRowPct && !includeColPct && !includeTotalPct) ? 
           `${dataStyle} border-right: 2px solid black; border-bottom: 1px solid black`
          : `${dataStyle} border-right: 2px solid black; border-bottom: 0px solid black`
        });
        output.push(thisRow);

        /* row percentages */
        if (includeRowPct) {
          thisRow = [];
          thisRow.push({skip: true});
          thisRow.push({skip: true});
          thisRow.push({
            content: "% row",
            style : (!includeColPct && !includeTotalPct) ? 
             `${baseStyle} border-right: 2px solid black; border-bottom: 1px solid black`
            : `${baseStyle} border-right: 2px solid black; border-bottom: 0px solid black`
          });
          for (let col : number = 0; col < data["colReordered"].length; col++) {
            thisRow.push({
              content: this.round(data['values'][row-2][col] / data['rowTotals'][row - 2]),
              style : (!includeColPct && !includeTotalPct) ? 
               `${dataStyle} border-right: 1px solid black; border-bottom: 1px solid black`
              : `${dataStyle} border-right: 1px solid black; border-bottom: 0px solid black`
            });
          }
          thisRow.push({
            content: allPct,
            style : (!includeColPct && !includeTotalPct) ? 
             `${dataStyle} border-right: 2px solid black; border-bottom: 1px solid black`
            : `${dataStyle} border-right: 2px solid black; border-bottom: 0px solid black`
          });
          output.push(thisRow);
        }

        /* col percentages */
        if (includeColPct) {
          thisRow = [];
          thisRow.push({skip: true});
          thisRow.push({skip: true});
          thisRow.push({
            content: "% column",
            style : (!includeTotalPct) ? 
             `${baseStyle} border-right: 2px solid black; border-bottom: 1px solid black`
            : `${baseStyle} border-right: 2px solid black; border-bottom: 0px solid black`
          });
          for (let col : number = 0; col < data["colReordered"].length; col++) {
            thisRow.push({
              content: this.round(data['values'][row-2][col] / data['colTotals'][col]) || 0,
              style : (!includeTotalPct) ? 
               `${dataStyle} border-right: 1px solid black; border-bottom: 1px solid black`
              : `${dataStyle} border-right: 1px solid black; border-bottom: 0px solid black`
            });
          }
          thisRow.push({
            content: this.round(data['rowTotals'][row - 2] / data['overallTotal']),
            style : (!includeTotalPct) ? 
             `${dataStyle} border-right: 2px solid black; border-bottom: 1px solid black`
            : `${dataStyle} border-right: 2px solid black; border-bottom: 0px solid black`
          });
          output.push(thisRow);
        }

        /* overall percentage */
        if (includeTotalPct) {
          thisRow = [];
          thisRow.push({skip: true});
          thisRow.push({skip: true});
          thisRow.push({
            content: "% total",
            style: `${baseStyle} border-right: 2px solid black; border-bottom: 1px solid black`
          });
          for (let col : number = 0; col < data["colReordered"].length; col++) {
            thisRow.push({
              content: this.round(data['values'][row-2][col] / data['overallTotal']),
              style: `${dataStyle} border-right: 1px solid black; border-bottom: 1px solid black`
            });
          }
          thisRow.push({
            content: this.round(data['rowTotals'][row - 2] / data['overallTotal']),
            style: `${dataStyle} border-right: 2px solid black; border-bottom: 1px solid black`
          });
          output.push(thisRow);
        }
      
      } else if (row == data["rows"] - 1) {
        /* Count */
        thisRow = [];
        thisRow.push({
          rowspan: rowMultiplier,
          content: 'Total',
          style: `
          vertical-align: top;
          border-top: 0px solid black;
          border-bottom: 2px solid black;
          border-left: 2px solid black;
          border-right: 0px solid black;
          `
        });
        thisRow.push({
          rowspan: rowMultiplier,
          content: '',
          style: `${baseStyle}
          border-bottom: 2px solid black;
          border-right: 0px solid black;
          `
        });
        thisRow.push({
          content: 'Count',
          style : (!includeRowPct && !includeColPct && !includeTotalPct) ? 
           `${baseStyle} border-right: 2px solid black; border-bottom: 2px solid black`
          : `${baseStyle} border-right: 2px solid black; border-bottom: 0px solid black`
        });
        for (let col : number = 0; col < data["colReordered"].length; col++) {
          thisRow.push({
            content: data['colTotals'][col],
            style : (!includeRowPct && !includeColPct && !includeTotalPct) ? 
             `${dataStyle} border-right: 1px solid black; border-bottom: 2px solid black`
            : `${dataStyle} border-right: 1px solid black; border-bottom: 0px solid black`
          });
        }
        thisRow.push({
          content: data['overallTotal']
          ,
            style : (!includeRowPct && !includeColPct && !includeTotalPct) ? 
             `${dataStyle} border-right: 2px solid black; border-bottom: 2px solid black`
            : `${dataStyle} border-right: 2px solid black; border-bottom: 0px solid black`
        });
        output.push(thisRow);

        /* row percentage */
        if (includeRowPct) {
          thisRow = [];
          thisRow.push({skip: true});
          thisRow.push({skip: true});
          thisRow.push({
            content: "% row",
            style : (!includeColPct && !includeTotalPct) ? 
             `${baseStyle} border-right: 2px solid black; border-bottom: 2px solid black`
            : `${baseStyle} border-right: 2px solid black; border-bottom: 0px solid black`
          });
          for (let col : number = 0; col < data["colReordered"].length; col++) {
            thisRow.push({
              content: this.round(data['colTotals'][col] / data['overallTotal']),
              style : (!includeColPct && !includeTotalPct) ? 
               `${dataStyle} border-right: 1px solid black; border-bottom: 2px solid black`
              : `${dataStyle} border-right: 1px solid black; border-bottom: 0px solid black`
            });
          }
          thisRow.push({
            content: allPct,
            style : (!includeColPct && !includeTotalPct) ? 
             `${dataStyle} border-right: 2px solid black; border-bottom: 2px solid black`
            : `${dataStyle} border-right: 2px solid black; border-bottom: 0px solid black`
          });
          output.push(thisRow);
        }
        if (includeColPct) {
          thisRow = [];
          thisRow.push({skip: true});
          thisRow.push({skip: true});
          thisRow.push({
            content: "% column",
            style : (!includeTotalPct) ? 
             `${baseStyle} border-right: 2px solid black; border-bottom: 2px solid black`
            : `${baseStyle} border-right: 2px solid black; border-bottom: 0px solid black`
          });
          for (let col : number = 0; col < data["colReordered"].length; col++) {
            thisRow.push({
              content: allPct,
              style : (!includeTotalPct) ? 
               `${dataStyle} border-right: 1px solid black; border-bottom: 2px solid black`
              : `${dataStyle} border-right: 1px solid black; border-bottom: 0px solid black`
            });
          }
          thisRow.push({
            content: allPct,
            style : (!includeTotalPct) ? 
             `${dataStyle} border-right: 2px solid black; border-bottom: 2px solid black`
            : `${dataStyle} border-right: 2px solid black; border-bottom: 0px solid black`
          });
          output.push(thisRow);
        }
        if (includeTotalPct) {
          thisRow = [];
          thisRow.push({skip: true});
          thisRow.push({skip: true});
          thisRow.push({
            content: "% total",
            style : `${baseStyle} border-right: 2px solid black; border-bottom: 2px solid black`
          });
          for (let col : number = 0; col < data["colReordered"].length; col++) {
            thisRow.push({
              content: this.round(data['colTotals'][col] / data['overallTotal']),
              style : `${dataStyle} border-right: 1px solid black; border-bottom: 2px solid black`
            });
          }
          thisRow.push({
            content: allPct,
            style : `${dataStyle} border-right: 2px solid black; border-bottom: 2px solid black`
          });
          output.push(thisRow);
        }


      }
      
    }

    return output;
    
  }

  private static round(n: number) : string {
    return `${Math.round((n + Number.EPSILON) * 1000) / 10}%`;
  }

  private static sum(t: number, n: number) : number {
    return t + n;
  }

  private static parseSettings(dataView: DataView): VisualSettings {
    return <VisualSettings>VisualSettings.parse(dataView);
  }

  /**
   * This function gets called for each of the objects defined in the capabilities files and allows you to select which of the
   * objects and properties you want to expose to the users in the property pane.
   *
   */
  public enumerateObjectInstances(
    options: EnumerateVisualObjectInstancesOptions
  ): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
    return VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options);
  }
}
