import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfigService } from './config.service';


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
}

export interface UpdateGroupData {
  name?: string;
  description?: string;
  isActive?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class GroupService {
  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {}

  // 获取所有群组
  getAllGroups(): Observable<Group[]> {
    const url = this.configService.buildApiUrl('/groups');
    return this.http.get<Group[]>(url);
  }

  // 获取群组详情
  getGroupById(id: string): Observable<Group> {
    const url = this.configService.buildApiUrl(`/groups/${id}`);
    return this.http.get<Group>(url);
  }

  // 创建群组
  createGroup(groupData: CreateGroupData): Observable<Group> {
    const url = this.configService.buildApiUrl('/groups');
    return this.http.post<Group>(url, groupData);
  }

  // 更新群组
  updateGroup(id: string, groupData: UpdateGroupData): Observable<Group> {
    const url = this.configService.buildApiUrl(`/groups/${id}`);
    return this.http.put<Group>(url, groupData);
  }

  // 删除群组
  deleteGroup(id: string): Observable<{ message: string }> {
    const url = this.configService.buildApiUrl(`/groups/${id}`);
    return this.http.delete<{ message: string }>(url);
  }

  // 分配用户到群组
  assignUsersToGroup(groupId: string, userIds: string[]): Observable<{ message: string }> {
    const url = this.configService.buildApiUrl(`/groups/${groupId}/users`);
    return this.http.post<{ message: string }>(url, { userIds });
  }

  // 从群组移除用户
  removeUserFromGroup(groupId: string, userId: string): Observable<{ message: string }> {
    const url = this.configService.buildApiUrl(`/groups/${groupId}/users/${userId}`);
    return this.http.delete<{ message: string }>(url);
  }
}