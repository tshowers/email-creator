import { EmailTemplate } from '../services/email-creator-api.service';
import { applyWritten, carryOver, editorGroups, filterTemplates, neededLabels } from './templates';

const newsletter: EmailTemplate = {
  id: 'newsletter', name: 'Newsletter', description: '', category: 'marketing',
  groups: [ { id: 'hero', label: 'Main story', optional: false, fields: [ { key: 'hero.title', label: 'Headline', type: 'text' }, { key: 'hero.body', label: 'Text', type: 'textarea' } ] } ],
  sections: [
    { id: 'story-1', label: 'Story 1', optional: true, fields: [ { key: 'story1.title', label: 'Headline', type: 'text' }, { key: 'story1.link', label: 'Link', type: 'url' } ] },
    { id: 'photo', label: 'Your photo', optional: true, fields: [ { key: 'sender.photo_url', label: 'Photo url', type: 'image' } ] },
  ],
  fields: [ 'hero.title', 'hero.body', 'story1.title', 'story1.link' ],
  starter: { 'email.subject': 'The Fernwood Monthly', 'hero.title': 'Winter roasts are here', 'story1.title': 'Pour-over, explained' },
};
const note: EmailTemplate = { ...newsletter, id: 'personal-note', category: 'personal', fields: [ 'note.greeting' ], starter: { 'note.greeting': 'Hi Jordan,' } };

describe( 'templates utils', () => {
  it( 'filters by category, all by default', () => {
    expect( filterTemplates( [ newsletter, note ], 'all' ).length ).toBe( 2 );
    expect( filterTemplates( [ newsletter, note ], 'personal' ).map( ( t ) => t.id ) ).toEqual( [ 'personal-note' ] );
  } );

  it( 'builds the form: values, starter text as placeholder, switches, and nothing to type for profile fields', () => {
    const groups = editorGroups( newsletter, { 'hero.title': 'Our news' }, [ 'story-1' ], new Set( [ 'hero.body' ] ) );
    expect( groups[ 0 ].fields[ 0 ] ).toEqual( jasmine.objectContaining( { value: 'Our news', placeholder: 'Winter roasts are here', needed: false } ) );
    expect( groups[ 0 ].fields[ 1 ].needed ).toBeTrue();
    expect( groups[ 1 ] ).toEqual( jasmine.objectContaining( { id: 'story-1', on: false } ) );
    expect( groups[ 1 ].fields[ 1 ].placeholder ).toBe( 'https://' );
    expect( groups[ 2 ].fields ).toEqual( [] );
    expect( groups[ 2 ].note ).toBe( 'Comes from your profile.' );
  } );

  it( 'keeps the subject and fitting fields when the template changes, and the new example words otherwise', () => {
    const carried = carryOver( { 'email.subject': 'Holiday hours', 'hero.title': 'Not in a note', 'note.greeting': '' }, note );
    expect( carried ).toEqual( { 'email.subject': 'Holiday hours', 'note.greeting': 'Hi Jordan,' } );
  } );

  it( 'lays written words over the form and clears what is left for the person', () => {
    const next = applyWritten( { 'hero.title': 'Winter roasts are here', 'hero.body': 'Example' }, { 'hero.title': 'Our news' }, [ 'hero.body' ] );
    expect( next ).toEqual( { 'hero.title': 'Our news', 'hero.body': '' } );
    expect( neededLabels( newsletter, [ 'hero.body', 'email.subject' ] ) ).toBe( 'Main story: text, Subject' );
  } );
} );
