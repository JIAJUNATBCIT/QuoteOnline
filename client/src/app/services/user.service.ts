import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

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
    return this.http.get<User[]>(`${environment.apiUrl}/users`);
  }

  getUserById(id: string): Observable<User> {
    return this.http.get<User>(`${environment.apiUrl}/users/${id}`);
  }

  updateUserRole(id: string, role: string): Observable<User> {
    return this.http.patch<User>(`${environment.apiUrl}/users/${id}/role`, { role });
  }

  getSuppliers(): Observable<User[]> {
    return this.http.get<User[]>(`${environment.apiUrl}/users/suppliers`);
  }

  updateUserProfile(id: string, profileData: any): Observable<User> {
    return this.http.put<User>(`${environment.apiUrl}/users/${id}`, profileData);
  }

  deleteUser(id: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/users/${id}`);
  }

  changePassword(id: string, passwordData: { currentPassword: string; newPassword: string }): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/users/${id}/password`, passwordData);
  }

  // 管理员修改用户密码
  adminChangePassword(id: string, newPassword: string): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/users/${id}/password`, { newPassword });
  }
}