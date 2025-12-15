import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environment';

export interface CustomerGroup {
  _id: string;
  name: string;
  description: string;
  isActive: boolean;
  customers?: any[];
  createdBy: any;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerGroupRequest {
  name: string;
  description?: string;
}

export interface UpdateCustomerGroupRequest {
  name?: string;
  description?: string;
  isActive?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CustomerGroupService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  // 获取所有客户群组
  getCustomerGroups(): Observable<CustomerGroup[]> {
    return this.http.get<CustomerGroup[]>(`${this.apiUrl}/customer-groups`);
  }

  // 获取单个客户群组详情
  getCustomerGroup(id: string): Observable<CustomerGroup> {
    return this.http.get<CustomerGroup>(`${this.apiUrl}/customer-groups/${id}`);
  }

  // 创建客户群组
  createCustomerGroup(group: CreateCustomerGroupRequest): Observable<CustomerGroup> {
    return this.http.post<CustomerGroup>(`${this.apiUrl}/customer-groups`, group);
  }

  // 更新客户群组
  updateCustomerGroup(id: string, group: UpdateCustomerGroupRequest): Observable<CustomerGroup> {
    return this.http.put<CustomerGroup>(`${this.apiUrl}/customer-groups/${id}`, group);
  }

  // 删除客户群组（软删除）
  deleteCustomerGroup(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/customer-groups/${id}`);
  }

  // 分配客户到群组
  assignCustomersToGroup(groupId: string, customerIds: string[]): Observable<CustomerGroup> {
    return this.http.post<CustomerGroup>(`${this.apiUrl}/customer-groups/${groupId}/customers`, {
      customerIds
    });
  }

  // 从群组移除客户
  removeCustomerFromGroup(groupId: string, customerId: string): Observable<CustomerGroup> {
    return this.http.delete<CustomerGroup>(`${this.apiUrl}/customer-groups/${groupId}/customers/${customerId}`);
  }

  // 获取所有客户（用于分配到群组）
  getCustomers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/users?forCustomerGroup=true`);
  }
}