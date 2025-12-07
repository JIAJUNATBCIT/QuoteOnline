import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';


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
  constructor(private http: HttpClient) { }

  getAllUsers(): Observable<User[]> {
    return this.http.get<User[]>(`/api/users`);
  }

  getUserById(id: string): Observable<User> {
    return this.http.get<User>(`/api/users/${id}`);
  }

  updateUserRole(id: string, role: string): Observable<User> {
    return this.http.patch<User>(`/api/users/${id}/role`, { role });
  }

  getSuppliers(): Observable<User[]> {
    return this.http.get<User[]>(`/api/users/suppliers`);
  }

  updateUserProfile(id: string, profileData: any): Observable<User> {
    return this.http.put<User>(`/api/users/${id}`, profileData);
  }

  deleteUser(id: string): Observable<any> {
    return this.http.delete(`/api/users/${id}`);
  }

  changePassword(id: string, passwordData: { currentPassword: string; newPassword: string }): Observable<any> {
    return this.http.patch(`/api/users/${id}/password`, passwordData);
  }

  // 管理员修改用户密码
  adminChangePassword(id: string, newPassword: string): Observable<any> {
    return this.http.patch(`/api/users/${id}/password`, { newPassword });
  }
}