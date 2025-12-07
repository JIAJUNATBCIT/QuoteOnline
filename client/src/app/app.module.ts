import { NgModule, ErrorHandler } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { GlobalErrorHandler } from './error.handler';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './components/login/login.component';
import { RegisterComponent } from './components/register/register.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';

import { QuoteCreateComponent } from './components/quote-create/quote-create.component';
import { QuoteDetailComponent } from './components/quote-detail/quote-detail.component';
import { UserListComponent } from './components/user-list/user-list.component';
import { UserProfileComponent } from './components/user-profile/user-profile.component';
import { QuoteRedirectComponent } from './components/quote-redirect/quote-redirect.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { NavbarComponent } from './components/navbar/navbar.component';
import { GroupManagementComponent } from './components/group-management/group-management.component';
import { FilterPipe } from './pipes/filter.pipe';
import { DevToolsComponent } from './components/dev-tools/dev-tools.component';



@NgModule({ declarations: [
        AppComponent,
        LoginComponent,
        RegisterComponent,
        DashboardComponent,
        QuoteCreateComponent,
        QuoteDetailComponent,
        UserListComponent,
        UserProfileComponent,
        QuoteRedirectComponent,
        ForgotPasswordComponent,
        ResetPasswordComponent,
        NavbarComponent,
        GroupManagementComponent,
        FilterPipe,
        DevToolsComponent,
    ],
    bootstrap: [AppComponent], imports: [BrowserModule,
        AppRoutingModule,
        ReactiveFormsModule,
        FormsModule,
        CommonModule,
        NgbModule],     providers: [
        {
            provide: HTTP_INTERCEPTORS,
            useClass: AuthInterceptor,
            multi: true
        },
        {
            provide: ErrorHandler,
            useClass: GlobalErrorHandler
        },
        provideHttpClient(withInterceptorsFromDi())
    ] })
export class AppModule { }