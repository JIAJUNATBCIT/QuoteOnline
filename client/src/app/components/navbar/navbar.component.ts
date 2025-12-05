import { Component, HostListener, ElementRef } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {
  isDropdownOpen = false;
  isMobileMenuOpen = false;

  constructor(
    public authService: AuthService,
    private router: Router,
    private el: ElementRef
  ) { }

  toggleDropdown(event: Event) {
    event.preventDefault();
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  closeDropdown() {
    this.isDropdownOpen = false;
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu() {
    this.isMobileMenuOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const clickedInside = this.el.nativeElement.contains(event.target);
    if (!clickedInside) {
      this.isDropdownOpen = false;
      // 关闭移动端菜单
      if (this.isMobileMenuOpen) {
        this.isMobileMenuOpen = false;
      }
    }
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  getRoleDisplayName(role: string): string {
    const roleNames: { [key: string]: string } = {
      'customer': '客户',
      'quoter': '报价员',
      'admin': '管理员',
      'supplier': '供应商'
    };
    return roleNames[role] || role;
  }

  getRoleIcon(role: string): string {
    const roleIcons: { [key: string]: string } = {
      'customer': 'bi bi-person',
      'quoter': 'bi bi-calculator',
      'admin': 'bi bi-shield-check',
      'supplier': 'bi bi-shop'
    };
    return roleIcons[role] || 'bi bi-person';
  }
}