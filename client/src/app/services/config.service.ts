import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';

export interface FrontendConfig {
  apiUrl: string;
  frontendUrl: string;
  uploadUrl: string;
  maxFileSize: number;
  maxFilesCount: number;
  allowedFileExtensions: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private config: FrontendConfig | null = null;
  private configSubject = new BehaviorSubject<FrontendConfig | null>(null);
  public config$ = this.configSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * 加载配置
   */
  async loadConfig(): Promise<FrontendConfig> {
    if (this.config) {
      return this.config;
    }

    try {
      const response: any = await this.http.get('/api/config/frontend').toPromise();
      this.config = response.data;
      this.configSubject.next(this.config);
      
      console.log('配置加载成功:', this.config);
      return this.config;
    } catch (error) {
      console.error('配置加载失败，使用默认配置:', error);
      
      // 默认配置
      const defaultConfig: FrontendConfig = {
        apiUrl: '/api',
        frontendUrl: window.location.origin,
        uploadUrl: '/uploads',
        maxFileSize: 10485760, // 10MB
        maxFilesCount: 10,
        allowedFileExtensions: ['.xlsx', '.xls']
      };
      
      this.config = defaultConfig;
      this.configSubject.next(this.config);
      return this.config;
    }
  }

  /**
   * 获取API URL
   */
  getApiUrl(): string {
    return this.config?.apiUrl || '/api';
  }

  /**
   * 获取前端URL
   */
  getFrontendUrl(): string {
    return this.config?.frontendUrl || window.location.origin;
  }

  /**
   * 获取上传URL
   */
  getUploadUrl(): string {
    return this.config?.uploadUrl || '/uploads';
  }

  /**
   * 获取最大文件大小
   */
  getMaxFileSize(): number {
    return this.config?.maxFileSize || 10485760;
  }

  /**
   * 获取最大文件数量
   */
  getMaxFilesCount(): number {
    return this.config?.maxFilesCount || 10;
  }

  /**
   * 获取允许的文件扩展名
   */
  getAllowedFileExtensions(): string[] {
    return this.config?.allowedFileExtensions || ['.xlsx', '.xls'];
  }

  /**
   * 生成完整的URL
   */
  buildUrl(path: string): string {
    const baseUrl = this.getFrontendUrl();
    return `${baseUrl}${path.startsWith('/') ? path : '/' + path}`;
  }

  /**
   * 生成API URL
   */
  buildApiUrl(path: string): string {
    const baseUrl = this.getApiUrl();
    return `${baseUrl}${path.startsWith('/') ? path : '/' + path}`;
  }

  /**
   * 生成文件下载URL
   */
  buildFileUrl(fileType: string, quoteId: string, fileIndex?: number): string {
    const baseUrl = this.getApiUrl();
    if (fileIndex !== undefined) {
      return `${baseUrl}/quotes/${quoteId}/download/${fileType}-${fileIndex}`;
    }
    return `${baseUrl}/quotes/${quoteId}/download/${fileType}`;
  }

  /**
   * 检查文件是否允许上传
   */
  isFileAllowed(filename: string): boolean {
    const extension = this.getFileExtension(filename);
    return this.getAllowedFileExtensions().includes(extension);
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filename.substring(lastDot).toLowerCase();
  }

  /**
   * 格式化文件大小显示
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}