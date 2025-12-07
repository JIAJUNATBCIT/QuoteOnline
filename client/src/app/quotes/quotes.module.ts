import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

// 导入组件
import { QuoteCreateComponent } from '../components/quote-create/quote-create.component';
import { QuoteDetailComponent } from '../components/quote-detail/quote-detail.component';
import { AuthGuard } from '../guards/auth.guard';
import { RoleGuard } from '../guards/role.guard';

const routes: Routes = [
  {
    path: 'create',
    component: QuoteCreateComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['customer'] }
  },
  {
    path: ':id',
    component: QuoteDetailComponent,
    canActivate: [AuthGuard]
  }
];

@NgModule({
  declarations: [
    QuoteCreateComponent,
    QuoteDetailComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgbModule,
    RouterModule.forChild(routes)
  ]
})
export class QuotesModule { }