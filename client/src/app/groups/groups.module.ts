import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

// 导入组件
import { GroupManagementComponent } from '../components/group-management/group-management.component';
import { AuthGuard } from '../guards/auth.guard';
import { RoleGuard } from '../guards/role.guard';

const routes: Routes = [
  {
    path: '',
    component: GroupManagementComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['admin', 'quoter'] }
  }
];

@NgModule({
  declarations: [
    GroupManagementComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgbModule,
    RouterModule.forChild(routes)
  ]
})
export class GroupsModule { }