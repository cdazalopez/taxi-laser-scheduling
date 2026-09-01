// Hand-written types mirroring supabase/schema.sql.
// Regenerate with `supabase gen types typescript` once the CLI is linked.

export type DispatcherStatus = "activo" | "inactivo" | "suspendido";
export type PermisoTipo = "vacaciones" | "permiso" | "enfermedad" | "personal" | "otro";
export type PermisoEstado = "pendiente" | "aprobado" | "rechazado" | "cancelado";
export type ShiftEstado = "programado" | "confirmado" | "ausente" | "cubierto";

export interface Dispatcher {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  status: DispatcherStatus;
  skills: string[] | null;
  hire_date: string | null;
  external_ref: string | null;
  available_override: string | null;
  created_at: string;
  updated_at: string;
}

export interface Shift {
  id: string;
  dispatcher_id: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  position: string | null;
  status: ShiftEstado;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Permiso {
  id: string;
  dispatcher_id: string;
  tipo: PermisoTipo;
  estado: PermisoEstado;
  start_date: string;
  end_date: string;
  reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PoolActivo {
  dispatcher_id: string;
  is_active: boolean;
  current_status: string | null;
  source: string | null;
  updated_at: string;
}

export interface DemandaHistorica {
  id: string;
  demand_date: string;
  hour: number;
  ride_count: number;
  dispatchers_on: number | null;
  source: string | null;
  created_at: string;
}

// Minimal Database shape so the typed client compiles.
export interface Database {
  public: {
    Tables: {
      dispatchers: { Row: Dispatcher; Insert: Partial<Dispatcher>; Update: Partial<Dispatcher> };
      schedule: { Row: Shift; Insert: Partial<Shift>; Update: Partial<Shift> };
      permisos: { Row: Permiso; Insert: Partial<Permiso>; Update: Partial<Permiso> };
      pool_activo: { Row: PoolActivo; Insert: Partial<PoolActivo>; Update: Partial<PoolActivo> };
      demanda_historica: {
        Row: DemandaHistorica;
        Insert: Partial<DemandaHistorica>;
        Update: Partial<DemandaHistorica>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      dispatcher_status: DispatcherStatus;
      permiso_tipo: PermisoTipo;
      permiso_estado: PermisoEstado;
      shift_estado: ShiftEstado;
    };
  };
}
