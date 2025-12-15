import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

// 导入组件
import { SupplierGroupManagementComponent } from '../components/supplier-group-management/supplier-group-management.component';
import { AuthGuard } from '../guards/auth.guard';
import { RoleGuard } from '../guards/role.guard';

const routes: Routes = [
  {
    path: '',
    component: SupplierGroupManagementComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['admin', 'quoter'] }
  }
];

@NgModule({
  declarations: [
    SupplierGroupManagementComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgbModule,
    RouterModule.forChild(routes)
  ]
})
export class SupplierGroupsModule { }