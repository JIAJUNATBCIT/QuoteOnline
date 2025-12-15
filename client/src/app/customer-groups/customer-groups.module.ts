import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { CustomerGroupManagementComponent } from '../components/customer-group-management/customer-group-management.component';
import { AuthGuard } from '../guards/auth.guard';

const routes = [
  {
    path: '',
    component: CustomerGroupManagementComponent,
    canActivate: [AuthGuard]
  }
];

@NgModule({
  declarations: [
    CustomerGroupManagementComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild(routes),
    NgbModule
  ],
  exports: [
    CustomerGroupManagementComponent
  ]
})
export class CustomerGroupsModule { }