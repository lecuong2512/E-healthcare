import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Component } from '@angular/core';
import { AppComponent } from './app.component';
import { AuthService } from './core/services/auth.service';
import { of } from 'rxjs';

@Component({
  selector: 'app-dummy',
  standalone: true,
  template: '<div>Dummy Page</div>',
})
class DummyComponent {}

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let router: Router;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj<AuthService>('AuthService', ['logout']);
    authServiceSpy.logout.and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([
          { path: 'login', component: DummyComponent },
          { path: 'receptionist/queue-board', component: DummyComponent },
          { path: 'patient/doctor-search', component: DummyComponent },
        ]),
        { provide: AuthService, useValue: authServiceSpy },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  it('should show navbar on standard routes like /patient/doctor-search', async () => {
    await router.navigateByUrl('/patient/doctor-search');
    fixture.detectChanges();

    expect(component.isQueueBoard()).toBeFalse();
    const navbar = fixture.nativeElement.querySelector('app-navbar');
    expect(navbar).not.toBeNull();
  });

  it('should hide navbar on /receptionist/queue-board (Smart TV mode)', async () => {
    await router.navigateByUrl('/receptionist/queue-board');
    fixture.detectChanges();

    expect(component.isQueueBoard()).toBeTrue();
    const navbar = fixture.nativeElement.querySelector('app-navbar');
    expect(navbar).toBeNull();
  });
});
