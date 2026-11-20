import type { Role } from '@/lib/auth-context';
import type { Adjustment, TimeEntry } from '@/lib/time';

export type AdminUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  dateOfBirth: string | null;
  role: Role;
  isActive: boolean;
  /** ISO time of the open shift, or null when stamped out. */
  activeSince: string | null;
  /** Names of the user's approved work places (godkjente arbeidssteder). */
  workplaces?: string[];
};

export type ApprovedLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  createdAt: string;
};

export type LocationsData = {
  user: { id: string; firstName: string; lastName: string; role: Role };
  locations: ApprovedLocation[];
};

export type AdminEntry = TimeEntry & { editedAt: string | null };

export type AdminDetail = {
  serverTime: string;
  user: AdminUser;
  entries: AdminEntry[];
  adjustments: Adjustment[];
};

export const ROLE_LABEL: Record<Role, string> = {
  customer: 'Kunde',
  professional: 'Fagperson',
  admin: 'Administrator',
  super_admin: 'Systemadministrator',
};

export type CompanyAdmin = { id: string; email: string; firstName: string; lastName: string; isActive: boolean };

export type Company = {
  id: string;
  orgNumber: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  userCount: number;
  admins: CompanyAdmin[];
};
