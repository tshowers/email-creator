import { dataUrlToFile, mayaCopyMessage } from './maya';

describe( 'maya utils', () => {
  describe( 'mayaCopyMessage', () => {
    it( 'tells TODD to design the copy as written, with every part Maya gave', () => {
      expect( mayaCopyMessage( {
        subject: 'Fall loaves are here',
        body: 'Hi {{firstName}},\n\nPumpkin sourdough is back.',
        callToAction: { label: 'Order ahead', url: 'https://rise.example/order' },
        audience: 'regulars',
        tone: 'warm',
      } ) ).toBe( [
        'Maya, our Marketing Director, wrote this copy. Design the email using it as written:',
        '',
        'Subject: Fall loaves are here',
        '',
        'Hi {{firstName}},\n\nPumpkin sourdough is back.',
        '',
        'Call to action: Order ahead (https://rise.example/order)',
        'Audience: regulars',
        'Tone: warm',
      ].join( '\n' ) );
    } );

    it( 'leaves out the parts Maya didn\'t give', () => {
      expect( mayaCopyMessage( { subject: '', body: 'Just the body.', callToAction: { label: 'Call us' } } ) ).toBe(
        'Maya, our Marketing Director, wrote this copy. Design the email using it as written:\n\nJust the body.\n\nCall to action: Call us',
      );
    } );
  } );

  describe( 'dataUrlToFile', () => {
    it( 'keeps the type, name and bytes', async () => {
      const file = dataUrlToFile( 'data:image/png;base64,SGk=', 'logo.png' );
      expect( file.name ).toBe( 'logo.png' );
      expect( file.type ).toBe( 'image/png' );
      expect( Array.from( new Uint8Array( await file.arrayBuffer() ) ) ).toEqual( [ 0x48, 0x69 ] );
    } );
  } );
} );
