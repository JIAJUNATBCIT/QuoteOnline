import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'filter'
})
export class FilterPipe implements PipeTransform {
  transform(items: any[], searchText: string, ...keys: string[]): any[] {
    if (!items) {
      return [];
    }
    
    if (!searchText) {
      return items;
    }
    
    searchText = searchText.toLowerCase();
    
    return items.filter(item => {
      return keys.some(key => {
        const value = this.getNestedValue(item, key);
        return value && value.toString().toLowerCase().includes(searchText);
      });
    });
  }
  
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }
}