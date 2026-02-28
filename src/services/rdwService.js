const RDW_API_URL = 'https://opendata.rdw.nl/resource/m9d7-ebf2.json'
const RDW_BRANDSTOF_API_URL = 'https://opendata.rdw.nl/resource/8ys7-d773.json'

export async function getVoertuigData(kenteken) {
  // Kenteken formatteren (streepjes verwijderen en hoofdletters)
  const geformateerdKenteken = kenteken.replace(/-/g, '').toUpperCase()

  try {
    // Haal basis voertuigdata op
    const response = await fetch(`${RDW_API_URL}?kenteken=${geformateerdKenteken}`)

    if (!response.ok) {
      throw new Error('API request failed')
    }

    const data = await response.json()

    if (data.length === 0) {
      throw new Error('Kenteken niet gevonden')
    }

    const voertuig = data[0]

    // Haal brandstof/emissie data op
    try {
      const brandstofResponse = await fetch(`${RDW_BRANDSTOF_API_URL}?kenteken=${geformateerdKenteken}`)
      const brandstofData = await brandstofResponse.json()

      if (brandstofData.length > 0) {
        voertuig.brandstof_omschrijving = brandstofData[0].brandstof_omschrijving
        voertuig.emissiecode_omschrijving = brandstofData[0].emissiecode_omschrijving
        voertuig.nettomaximumvermogen = brandstofData[0].nettomaximumvermogen
      }
    } catch (error) {
      console.warn('Kon brandstof data niet ophalen:', error)
    }

    return voertuig
  } catch (error) {
    console.error('RDW API error:', error)
    throw error
  }
}

export function beoordeelGeschiktheid(voertuig) {
  const redenen = []
  let geschiktheidScore = 'Geschikt'
  const nu = new Date()

  // 0. Brandstop bepalen
  const brandstof = voertuig.brandstof_omschrijving?.toLowerCase() || ''
  const isDiesel = brandstof.includes('diesel')

  // 1. Check op huidige Voertuigsoort / Inrichting
  const inrichting = voertuig.inrichting?.toLowerCase() || ''
  const voertuigsoort = voertuig.voertuigsoort?.toLowerCase() || ''

  if (inrichting.includes('kampeerwagen') || voertuigsoort.includes('kampeerwagen')) {
    redenen.push('ℹ️ Dit voertuig staat al geregistreerd als kampeerwagen. Ombouwkeuring en rest-BPM zijn waarschijnlijk niet meer nodig.')
  } else if (!voertuigsoort.includes('bedrijfsauto')) {
    redenen.push('⚠️ Dit is momenteel geen bedrijfsauto (geel kenteken). De ombouwregels en BPM kunnen afwijken.')
    geschiktheidScore = 'Mogelijk'
  }

  // 2. Maximaal toegestane massa
  const maxMassa = parseInt(voertuig.toegestane_maximum_massa_voertuig) || 0
  if (maxMassa > 3500) {
    redenen.push('⚠️ LET OP: Gewicht >3500kg - C1 (camper) rijbewijs vereist!')
    geschiktheidScore = 'Mogelijk'
  } else if (maxMassa >= 3000) {
    redenen.push('✅ Goede gewichtsklasse voor een volwaardige inbouw.')
  } else if (maxMassa >= 2700) {
    redenen.push('⚠️ Let op je gewicht: gebruik lichtgewicht materialen om onder de 3500kg grens te blijven.')
    if (geschiktheidScore === 'Geschikt') geschiktheidScore = 'Mogelijk'
  } else {
    redenen.push('❌ Maximaal gewicht is erg laag - weinig laadvermogen over voor inbouw en bagage.')
    geschiktheidScore = 'Ongeschikt'
  }

  // 3. Hoogte & Blok-eis
  const hoogte = parseInt(voertuig.hoogte_voertuig) || 0
  if (hoogte > 0) {
    if (hoogte < 245) {
      redenen.push('💡 Hoogte: Waarschijnlijk heb je een hefdak nodig om aan de fiscale stahoogte-eis (170cm) te voldoen.')
    } else {
      redenen.push('✅ Hoogte: Deze bus lijkt hoog genoeg om direct aan de fiscale stahoogte-eis te voldoen.')
    }
  }

// 4. Emissieklasse (brandstof-specifiek)
const emissieklasse = voertuig.emissiecode_omschrijving
if (emissieklasse) {
  const emissieCijfer = parseInt(emissieklasse.replace(/\D/g, ''))
  
  if (isDiesel) {
    if (emissieCijfer >= 6) {
      redenen.push(`✅ Diesel Euro 6: Je hebt hiermee de meeste vrijheid in milieuzones (ook de strengste steden).`)
    } else if (emissieCijfer === 5) {
      redenen.push(`✅ Diesel Euro 5: Prima keuze voor de meeste reizen. Alleen in sommige stadscentra ben je niet meer welkom.`)
    } else {
      redenen.push(`⚠️ Diesel Euro ${emissieCijfer || emissieklasse}: Oudere diesel. Dit beperkt je toegang tot milieuzones aanzienlijk.`)
      // Alleen bij Euro 3 of lager de score echt naar 'Mogelijk' zetten
      if (emissieCijfer <= 3 && geschiktheidScore === 'Geschikt') geschiktheidScore = 'Mogelijk'
    }
  } else {
    // Benzine / LPG / Electrisch
    redenen.push(`✅ ${brandstof.charAt(0).toUpperCase() + brandstof.slice(1)}: Met een benzine- of LPG-motor heb je momenteel nauwelijks last van milieurerestricties.`)
  }
}

  // 5. NAP / Tellerstand check
  const tellerstand = voertuig.tellerstandoordeel
  if (tellerstand === 'Logisch') {
    redenen.push('✅ Tellerstand logisch (NAP)')
  } else {
    redenen.push('⚠️ LET OP: Geen logische tellerstand (NAP) gevonden. Controleer de historie extra goed!')
  }

  // 6. Verbeterde BPM Berekening (Forfaitaire tabel 2024-2026)
  const brutoBpm = parseInt(voertuig.bruto_bpm) || 0
  const datumToelatingStr = voertuig.datum_eerste_toelating
  let restBpm = 0

  if (brutoBpm > 0 && datumToelatingStr) {
    if (inrichting.includes('kampeerwagen')) {
      restBpm = 0
    } else {
      const jaar = parseInt(datumToelatingStr.substring(0, 4))
      const maand = parseInt(datumToelatingStr.substring(4, 6)) - 1
      const dag = parseInt(datumToelatingStr.substring(6, 8))
      const datumToelating = new Date(jaar, maand, dag)
      
      let maandenOud = (nu.getFullYear() - datumToelating.getFullYear()) * 12 + (nu.getMonth() - datumToelating.getMonth())
      if (nu.getDate() < datumToelating.getDate()) maandenOud--

      if (maandenOud >= 210) {
        redenen.push('✅ Voertuig ouder dan 17,5 jaar: Geen rest-BPM meer verschuldigd.')
        restBpm = 0
      } else {
        let percentage = 0
        if (maandenOud < 1) percentage = 100
        else if (maandenOud < 3)  percentage = 88
        else if (maandenOud < 6)  percentage = 79
        else if (maandenOud < 9)  percentage = 67
        else if (maandenOud < 12) percentage = 58
        else {
          const korting = 37 + (maandenOud * 0.5)
          percentage = Math.max(0, 100 - korting)
        }
        restBpm = Math.max(0, Math.round((brutoBpm * percentage) / 100))
        redenen.push(`💰 Rest-BPM indicatie: €${restBpm.toLocaleString('nl-NL')}`)
      }
    }
  }

  return {
    redenen,
    score: geschiktheidScore,
    restBpm
  }
}
