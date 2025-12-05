import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Group {
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
  users?: GroupUser[];
}

export interface GroupUser {
  _id: string;
  name: string;
  email: string;
  company?: string;
}

export interface CreateGroupData {
  name: string;
  description?: string;
  color?: string;
}

export interface UpdateGroupData {
  name?: string;
  description?: string;
  color?: string;
  isActive?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class GroupService {
  private readonly apiUrl = `${environment.apiUrl}/groups`;

  constructor(private http: HttpClient) {}

  // 获取所有群组
  getAllGroups(): Observable<Group[]> {
    return this.http.get<Group[]>(this.apiUrl);
  }

  // 获取群组详情
  getGroupById(id: string): Observable<Group> {
    return this.http.get<Group>(`${this.apiUrl}/${id}`);
  }

  // 创建群组
  createGroup(groupData: CreateGroupData): Observable<Group> {
    return this.http.post<Group>(this.apiUrl, groupData);
  }

  // 更新群组
  updateGroup(id: string, groupData: UpdateGroupData): Observable<Group> {
    return this.http.put<Group>(`${this.apiUrl}/${id}`, groupData);
  }

  // 删除群组
  deleteGroup(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }

  // 分配用户到群组
  assignUsersToGroup(groupId: string, userIds: string[]): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/${groupId}/users`, { userIds });
  }

  // 从群组移除用户
  removeUserFromGroup(groupId: string, userId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${groupId}/users/${userId}`);
  }
}