import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environment';


export interface SupplierGroup {
  _id: string;
  name: string;
  description?: string;
  color: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    _id: string;
    name: string;
    email: string;
  };
  users?: SupplierGroupUser[];
}

export interface SupplierGroupUser {
  _id: string;
  name: string;
  email: string;
  company?: string;
}

export interface CreateSupplierGroupData {
  name: string;
  description?: string;
}

export interface UpdateSupplierGroupData {
  name?: string;
  description?: string;
  isActive?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SupplierGroupService {
  constructor(
    private http: HttpClient
  ) {}

  // 获取所有供应商群组
  getAllSupplierGroups(): Observable<SupplierGroup[]> {
    const url = `${environment.apiUrl}/supplierGroups`;
    return this.http.get<SupplierGroup[]>(url);
  }

  // 获取供应商群组详情
  getSupplierGroupById(id: string): Observable<SupplierGroup> {
    const url = `${environment.apiUrl}/supplierGroups/${id}`;
    return this.http.get<SupplierGroup>(url);
  }

  // 创建供应商群组
  createSupplierGroup(groupData: CreateSupplierGroupData): Observable<SupplierGroup> {
    const url = `${environment.apiUrl}/supplierGroups`;
    return this.http.post<SupplierGroup>(url, groupData);
  }

  // 更新供应商群组
  updateSupplierGroup(id: string, groupData: UpdateSupplierGroupData): Observable<SupplierGroup> {
    const url = `${environment.apiUrl}/supplierGroups/${id}`;
    return this.http.put<SupplierGroup>(url, groupData);
  }

  // 删除供应商群组
  deleteSupplierGroup(id: string): Observable<{ message: string }> {
    const url = `${environment.apiUrl}/supplierGroups/${id}`;
    return this.http.delete<{ message: string }>(url);
  }

  // 分配用户到供应商群组
  assignUsersToSupplierGroup(groupId: string, userIds: string[]): Observable<{ message: string }> {
    const url = `${environment.apiUrl}/supplierGroups/${groupId}/users`;
    return this.http.post<{ message: string }>(url, { userIds });
  }

  // 从供应商群组移除用户
  removeUserFromSupplierGroup(groupId: string, userId: string): Observable<{ message: string }> {
    const url = `${environment.apiUrl}/supplierGroups/${groupId}/users/${userId}`;
    return this.http.delete<{ message: string }>(url);
  }
}