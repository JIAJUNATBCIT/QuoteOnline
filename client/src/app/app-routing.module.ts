import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { RegisterComponent } from './components/register/register.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { QuoteListComponent } from './components/quote-list/quote-list.component';
import { QuoteCreateComponent } from './components/quote-create/quote-create.component';
import { QuoteDetailComponent } from './components/quote-detail/quote-detail.component';
import { UserListComponent } from './components/user-list/user-list.component';
import { UserProfileComponent } from './components/user-profile/user-profile.component';
import { AuthGuard } from './guards/auth.guard';
import { RoleGuard } from './guards/role.guard';

const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { 
    path: 'dashboard', 
    component: DashboardComponent,
    canActivate: [AuthGuard]
  },
  { 
    path: 'quotes', 
    component: QuoteListComponent,
    canActivate: [AuthGuard]
  },
  { 
    path: 'quotes/create', 
    component: QuoteCreateComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['customer'] }
  },
  { 
    path: 'quotes/:id', 
    component: QuoteDetailComponent,
    canActivate: [AuthGuard]
  },
  { 
    path: 'users', 
    component: UserListComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['admin'] }
  },
  { 
    path: 'profile', 
    component: UserProfileComponent,
    canActivate: [AuthGuard]
  },
  { path: '**', redirectTo: '/dashboard' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }