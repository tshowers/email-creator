import { EmailTemplate, TemplateFieldType } from '../services/email-creator-api.service';

/**
 * The template editor's logic, kept out of the component so the page binds
 * precomputed fields (no work in the template) and it can be tested alone.
 */

export type TemplateFilter = 'all' | 'marketing' | 'events' | 'personal';
export const TEMPLATE_FILTERS: { id: TemplateFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'events', label: 'Events' },
  { id: 'personal', label: 'Personal' },
];

export function filterTemplates ( list: EmailTemplate[], filter: TemplateFilter ): EmailTemplate[] {
  return filter === 'all' ? list : list.filter( ( template ) => template.category === filter );
}

export interface FieldView {
  key: string;
  label: string;
  type: TemplateFieldType;
  value: string;
  /** The writer left it for the person: a date, a price, a code only they know. */
  needed: boolean;
  placeholder: string;
}

export interface GroupView {
  id: string;
  label: string;
  optional: boolean;
  on: boolean;
  fields: FieldView[];
  /** What an optional section with nothing to edit here means (e.g. "Your photo" comes from the profile). */
  note: string;
}

// Filled from the profile, never typed in the editor.
const isShared = ( key: string ): boolean => /^(brand|email|links|sender)\./.test( key );

function fieldView ( field: { key: string; label: string; type: TemplateFieldType }, content: Record<string, string>, needs: Set<string>, starter: Record<string, string> ): FieldView {
  const placeholder = field.type === 'url' ? 'https://' : field.type === 'image' ? '' : starter[ field.key ] || '';
  return { key: field.key, label: field.label, type: field.type, value: content[ field.key ] || '', needed: needs.has( field.key ), placeholder };
}

/** The form: always-shown groups first, then the optional sections with their switches. */
export function editorGroups ( template: EmailTemplate, content: Record<string, string>, hidden: string[], needs: Set<string> ): GroupView[] {
  const off = new Set( hidden );
  const view = ( group: EmailTemplate[ 'groups' ][ number ] ): GroupView => {
    const fields = group.fields.filter( ( field ) => !isShared( field.key ) ).map( ( field ) => fieldView( field, content, needs, template.starter ) );
    return {
      id: group.id,
      label: group.label,
      optional: group.optional,
      on: !group.optional || !off.has( group.id ),
      fields,
      note: !fields.length && group.optional ? 'Comes from your profile.' : '',
    };
  };
  return [ ...template.groups.map( view ), ...template.sections.map( view ) ];
}

/** A new template's starting words: its starter text, then whatever the person already wrote that fits it. */
export function carryOver ( from: Record<string, string>, to: EmailTemplate ): Record<string, string> {
  const content: Record<string, string> = { ...to.starter };
  const keys = new Set( [ 'email.subject', 'email.preheader', ...to.fields ] );
  Object.entries( from ).forEach( ( [ key, value ] ) => {
    if ( keys.has( key ) && value ) content[ key ] = value;
  } );
  return content;
}

/** The words the writer returned laid over the form; what it left for the person is cleared so it can't go out as the example. */
export function applyWritten ( content: Record<string, string>, written: Record<string, string>, needs: string[] ): Record<string, string> {
  const next = { ...content, ...written };
  needs.forEach( ( key ) => {
    next[ key ] = written[ key ] || '';
  } );
  return next;
}

/** "Headline, Code": the needed fields by name, for the writer's note. */
export function neededLabels ( template: EmailTemplate, needs: string[] ): string {
  const labels = new Map<string, string>();
  [ ...template.groups, ...template.sections ].forEach( ( group ) => group.fields.forEach( ( field ) => labels.set( field.key, `${ group.label }: ${ field.label.toLowerCase() }` ) ) );
  labels.set( 'email.subject', 'Subject' );
  labels.set( 'email.preheader', 'Preview text' );
  return needs.map( ( key ) => labels.get( key ) || key ).join( ', ' );
}

/** What the ask box suggests, per template. */
export const ASK_PLACEHOLDERS: Record<string, string> = {
  newsletter: 'e.g. November news: our new winter hours, a customer story, and the holiday gift guide',
  announcement: 'e.g. We\'re launching delivery across the city starting next month',
  promotion: 'e.g. 20% off everything this weekend for newsletter readers',
  event: 'e.g. An open house at our new studio on a Saturday morning',
  'personal-note': 'e.g. A thank-you to a client after our kickoff meeting, with the proposal link',
};
