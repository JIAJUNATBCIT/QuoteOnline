import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfigService } from './config.service';


export interface User {
  _id: string;
  email: string;
  name: string;
  role: 'customer' | 'quoter' | 'admin' | 'supplier';
  company?: string;
  phone?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) { }

  getAllUsers(): Observable<User[]> {
    const url = this.configService.buildApiUrl('/users');
    return this.http.get<User[]>(url);
  }

  getUserById(id: string): Observable<User> {
    const url = this.configService.buildApiUrl(`/users/${id}`);
    return this.http.get<User>(url);
  }

  updateUserRole(id: string, role: string): Observable<User> {
    const url = this.configService.buildApiUrl(`/users/${id}/role`);
    return this.http.patch<User>(url, { role });
  }

  getSuppliers(): Observable<User[]> {
    const url = this.configService.buildApiUrl('/users/suppliers');
    return this.http.get<User[]>(url);
  }

  updateUserProfile(id: string, profileData: any): Observable<User> {
    const url = this.configService.buildApiUrl(`/users/${id}`);
    return this.http.put<User>(url, profileData);
  }

  deleteUser(id: string): Observable<any> {
    const url = this.configService.buildApiUrl(`/users/${id}`);
    return this.http.delete(url);
  }

  changePassword(id: string, passwordData: { currentPassword: string; newPassword: string }): Observable<any> {
    const url = this.configService.buildApiUrl(`/users/${id}/password`);
    return this.http.patch(url, passwordData);
  }

  // 管理员修改用户密码
  adminChangePassword(id: string, newPassword: string): Observable<any> {
    const url = this.configService.buildApiUrl(`/users/${id}/password`);
    return this.http.patch(url, { newPassword });
  }
}