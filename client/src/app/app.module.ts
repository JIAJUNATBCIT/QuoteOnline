import { NgModule, ErrorHandler, APP_INITIALIZER } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { GlobalErrorHandler } from './error.handler';
import { ConfigService } from './services/config.service';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './components/login/login.component';
import { RegisterComponent } from './components/register/register.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';

import { QuoteRedirectComponent } from './components/quote-redirect/quote-redirect.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { NavbarComponent } from './components/navbar/navbar.component';
import { FilterPipe } from './pipes/filter.pipe';
import { DevToolsComponent } from './components/dev-tools/dev-tools.component';



@NgModule({ declarations: [
        AppComponent,
        LoginComponent,
        RegisterComponent,
        DashboardComponent,
        QuoteRedirectComponent,
        ForgotPasswordComponent,
        ResetPasswordComponent,
        NavbarComponent,
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
        {
            provide: APP_INITIALIZER,
            useFactory: initializeConfig,
            deps: [ConfigService],
            multi: true
        },
        provideHttpClient(withInterceptorsFromDi())
    ] })
export function initializeConfig(configService: ConfigService) {
  return () => configService.loadConfig();
}

export class AppModule { }