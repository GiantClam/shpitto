'use client';

import type {MouseEvent} from 'react';
import {Admin, Layout, Menu, Resource, defaultLightTheme, type LayoutProps} from 'react-admin';

import {brand} from '../config/brand';
import {adminAuthProvider} from './auth-provider';
import {adminDataProvider} from './data-provider';
import {CommandPanel} from './command-panel';
import {AffiliateHoldList, AffiliateReviewList, AuditList, BillingList, GenerationList, UserList, WorkspaceList} from './resource-lists';
import './admin.css';

const {colors, typography, spacing} = brand.tokens;
const basePalette = defaultLightTheme.palette ?? {};
const lightTheme = {
  ...defaultLightTheme,
  palette: {
    ...basePalette,
    primary: {...(basePalette.primary ?? {}), main: colors.brand},
    secondary: {...(basePalette.secondary ?? {}), main: colors.warm},
    background: {...(basePalette.background ?? {}), default: colors.canvas, paper: colors.surface},
    text: {...(basePalette.text ?? {}), primary: colors.text, secondary: colors.textMuted},
    divider: colors.border,
  },
  typography: {...defaultLightTheme.typography, fontFamily: typography.body},
  components: {
    ...defaultLightTheme.components,
    MuiButton: {styleOverrides: {root: {borderRadius: spacing.radiusSm, minHeight: spacing.controlHeight, textTransform: 'none'}}},
    MuiListItemButton: {styleOverrides: {root: {minHeight: spacing.navHeight, fontSize: '0.95rem'}}},
  },
};

function Login() {
  return <main className="operations-console"><h1>Operator sign-in required</h1><p>Continue with the shared account and current global role.</p><a className="button" href="/login">Open sign in</a></main>;
}

function AdminMenu() {
  // Returning to the document entry avoids Next/HashRouter history churn at #/.
  return <Menu><Menu.DashboardItem onClick={(event: MouseEvent) => {event.preventDefault(); window.location.assign('/admin');}} /><Menu.ResourceItems /></Menu>;
}

function AdminLayout(props: LayoutProps) {return <Layout {...props} menu={AdminMenu} />;}

export default function AdminApp() {
  return <Admin title="Shpitto operations" dataProvider={adminDataProvider} authProvider={adminAuthProvider} loginPage={Login} dashboard={CommandPanel} layout={AdminLayout} defaultTheme="light" lightTheme={lightTheme} requireAuth>
    <Resource name="workspaces" list={WorkspaceList} /><Resource name="users" list={UserList} /><Resource name="generations" list={GenerationList} /><Resource name="billing" list={BillingList} /><Resource name="audit" list={AuditList} />
    <Resource name="affiliate-reviews" options={{label: 'Affiliate reviews'}} list={AffiliateReviewList} /><Resource name="affiliate-holds" options={{label: 'Affiliate holds'}} list={AffiliateHoldList} />
  </Admin>;
}
