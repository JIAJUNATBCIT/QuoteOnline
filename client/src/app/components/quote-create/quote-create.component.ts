import { Component } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { QuoteService } from '../../services/quote.service';

@Component({
  selector: 'app-quote-create',
  templateUrl: './quote-create.component.html',
  styleUrls: ['./quote-create.component.scss']
})
export class QuoteCreateComponent {
  quoteForm: FormGroup;
  loading = false;
  error = '';
  selectedFiles: File[] = [];

  constructor(
    private formBuilder: FormBuilder,
    private router: Router,
    private quoteService: QuoteService
  ) {
    this.quoteForm = this.formBuilder.group({
      title: [''], // 不设为必填，允许使用文件名作为默认值
      description: ['']
    });
  }

  onFilesSelected(event: any) {
    const files = Array.from(event.target.files) as File[];
    const validFiles: File[] = [];
    
    for (const file of files) {
      // 检查文件类型
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        this.error = `文件 ${file.name} 不是Excel文件，请选择 .xlsx 或 .xls 文件`;
        event.target.value = '';
        return;
      }
      
      // 检查文件大小 (10MB限制)
      if (file.size > 10 * 1024 * 1024) {
        this.error = `文件 ${file.name} 大小超过10MB`;
        event.target.value = '';
        return;
      }
      
      validFiles.push(file);
    }
    
    if (validFiles.length > 0) {
      this.selectedFiles = [...this.selectedFiles, ...validFiles];
      this.error = '';
    }
    
    // 清空input值，允许重复选择相同文件
    event.target.value = '';
  }

  onSubmit() {
    if (!this.selectedFiles || this.selectedFiles.length === 0) {
      this.error = '请上传报价文件';
      return;
    }

    this.loading = true;
    this.error = '';

    // 使用用户输入的标题，如果没有输入则使用第一个文件名（去掉扩展名）
    const userTitle = this.quoteForm.get('title')?.value?.trim();
    const fileName = this.selectedFiles[0].name;
    const defaultTitle = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
    const title = userTitle || defaultTitle;

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', this.quoteForm.get('description')?.value || '');
    
    // 添加多个文件，使用customerFiles字段名
    this.selectedFiles.forEach(file => {
      formData.append('customerFiles', file);
    });

    this.quoteService.createQuote(formData).subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: (error) => {
        this.error = error.error?.message || '创建询价单失败';
        this.loading = false;
      }
    });
  }

  // 清空选中的文件
  clearSelectedFiles() {
    this.selectedFiles = [];
  }

  // 格式化文件大小显示
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}