import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

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
  private config!: FrontendConfig;
  private configSubject = new BehaviorSubject<FrontendConfig>({} as FrontendConfig);
  public config$ = this.configSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * 加载配置
   */
  async loadConfig(): Promise<FrontendConfig> {
    if (this.config && this.config.apiUrl) {
      return this.config;
    }

    try {
      // 简化环境检测：只针对本地开发环境
      const isDevelopment = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1';
      const configUrl = isDevelopment ? 'http://localhost:3000/api/config/frontend' : '/api/config/frontend';
      
      const response: any = await this.http.get(configUrl).toPromise();
      
      // 处理后端返回结构
      this.config = response?.data || response;
      this.configSubject.next(this.config);

      console.log('配置加载成功:', this.config);
      return this.config;
    } catch (error) {
      console.error('配置加载失败，使用默认配置:', error);

      // 默认配置 - 简化环境检测
      const isDevelopment = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1';
      const defaultConfig: FrontendConfig = {
        apiUrl: isDevelopment ? 'http://localhost:3000/api' : '/api',
        frontendUrl: window.location.origin,
        uploadUrl: isDevelopment ? 'http://localhost:3000/uploads' : '/uploads',
        maxFileSize: 10485760, // 10MB
        maxFilesCount: 10,
        allowedFileExtensions: ['.xlsx', '.xls']
      };

      console.log('使用默认配置:', defaultConfig);
      this.config = defaultConfig;
      this.configSubject.next(this.config);
      return this.config;
    }
  }

  /**
   * 根据环境选择 API 基础 URL
   */
  private getApiBase(): string {
    // 如果运行在开发环境（4200），前端 proxy 会转发到 Node
    if (window.location.port === '4200') {
      return '/api';
    }
    // 生产环境同域名直接访问 /api
    return '/api';
  }

  // ------------------------------
  // 其他工具方法保持原样
  // ------------------------------

  getApiUrl(): string {
    return this.config.apiUrl || '/api';
  }

  getFrontendUrl(): string {
    return this.config.frontendUrl || window.location.origin;
  }

  getUploadUrl(): string {
    return this.config.uploadUrl || '/uploads';
  }

  getMaxFileSize(): number {
    return this.config.maxFileSize || 10485760;
  }

  getMaxFilesCount(): number {
    return this.config.maxFilesCount || 10;
  }

  getAllowedFileExtensions(): string[] {
    return this.config.allowedFileExtensions || ['.xlsx', '.xls'];
  }

  buildUrl(path: string): string {
    const baseUrl = this.getFrontendUrl();
    return `${baseUrl}${path.startsWith('/') ? path : '/' + path}`;
  }

  buildApiUrl(path: string): string {
    const baseUrl = this.getApiUrl();
    return `${baseUrl}${path.startsWith('/') ? path : '/' + path}`;
  }

  buildFileUrl(fileType: string, quoteId: string, fileIndex?: number): string {
    const baseUrl = this.getApiUrl();
    if (fileIndex !== undefined) {
      return `${baseUrl}/quotes/${quoteId}/download/${fileType}-${fileIndex}`;
    }
    return `${baseUrl}/quotes/${quoteId}/download/${fileType}`;
  }

  isFileAllowed(filename: string): boolean {
    const extension = this.getFileExtension(filename);
    return this.getAllowedFileExtensions().includes(extension);
  }

  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filename.substring(lastDot).toLowerCase();
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
