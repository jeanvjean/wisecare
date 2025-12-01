import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/auth'
import { useQuery, useQueryClient } from '@tanstack/react-query'

const onboardingSchema = z.object({
  carePreference: z.string(),
  mattersMost: z.array(z.string()),
  ageRanges: z.array(z.string()),
  fundingFrequency: z.string(),
  lovedOnesCountries: z.array(z.string()),
  lovedOnesCities: z.array(z.string()),
  numberOfLovedOnes: z.number().min(1).max(10),
  paymentFrequency: z.string()
})

type OnboardingForm = z.infer<typeof onboardingSchema>

const steps = [
  'Care Preference',
  'What Matters Most',
  'Age Ranges',
  'Healthcare Funding Frequency',
  'Loved Ones\' Countries',
  'Loved Ones\' Cities',
  'Number of Loved Ones',
  'Payment Frequency Preference'
]

const ageRangeOptions = [
  'Under 18 (Children and Teenagers)',
  '18 - 60 (Adult and dependents)',
  'Over 60 (Parents and senior)',
  'All of the above (Mixed Family members)'
]

function Onboarding() {
  const [currentStep, setCurrentStep] = useState(0)
  const [searchCountry, setSearchCountry] = useState('')
  const [searchCity, setSearchCity] = useState('')
  const [ageRangesSelected, setAgeRangesSelected] = useState<string[]>([])
  const { user, signOut } = useAuthStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [apiResponse, setApiResponse] = useState<any>(null)

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      mattersMost: [],
      ageRanges: [],
      lovedOnesCountries: [],
      lovedOnesCities: []
    }
  })

  const { data: countries = [] } = useQuery({
    queryKey: ['countries'],
    queryFn: async () => {
      try {
        const response = await fetch('https://restcountries.com/v3.1/all?fields=name')
        if (response.ok) {
          const data = await response.json()
          return data.map((country: any) => country.name.common).sort()
        } else {
          // Fallback to static list if API fails
          return [
            'Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Australia', 'Austria', 'Bangladesh', 'Belgium',
            'Brazil', 'Canada', 'Chile', 'China', 'Colombia', 'Denmark', 'Egypt', 'Finland', 'France', 'Germany',
            'Greece', 'India', 'Indonesia', 'Ireland', 'Italy', 'Japan', 'Jordan', 'Kenya', 'Malaysia', 'Mexico',
            'Morocco', 'Netherlands', 'New Zealand', 'Nigeria', 'Norway', 'Pakistan', 'Peru', 'Philippines',
            'Poland', 'Portugal', 'Russia', 'Saudi Arabia', 'Singapore', 'South Africa', 'South Korea', 'Spain',
            'Sweden', 'Switzerland', 'Thailand', 'Turkey', 'Ukraine', 'United Arab Emirates', 'United Kingdom',
            'United States', 'Vietnam'
          ]
        }
      } catch (error) {
        console.error('Failed to fetch countries:', error)
        // Fallback to static list
        return [
          'Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Australia', 'Austria', 'Bangladesh', 'Belgium',
          'Brazil', 'Canada', 'Chile', 'China', 'Colombia', 'Denmark', 'Egypt', 'Finland', 'France', 'Germany',
          'Greece', 'India', 'Indonesia', 'Ireland', 'Italy', 'Japan', 'Jordan', 'Kenya', 'Malaysia', 'Mexico',
          'Morocco', 'Netherlands', 'New Zealand', 'Nigeria', 'Norway', 'Pakistan', 'Peru', 'Philippines',
          'Poland', 'Portugal', 'Russia', 'Saudi Arabia', 'Singapore', 'South Africa', 'South Korea', 'Spain',
          'Sweden', 'Switzerland', 'Thailand', 'Turkey', 'Ukraine', 'United Arab Emirates', 'United Kingdom',
          'United States', 'Vietnam'
        ]
      }
    },
    staleTime: 24 * 60 * 60 * 1000 // 24 hours
  })

  const selectedCountries = watch('lovedOnesCountries') || []

  const { data: cities = [] } = useQuery({
    queryKey: ['cities', selectedCountries],
    queryFn: async () => {
      if (selectedCountries.length === 0) return []

      // Comprehensive fallback cities for selected countries
      const fallbackCities: { [key: string]: string[] } = {
        'Afghanistan': ['Kabul', 'Kandahar', 'Herat', 'Mazar-i-Sharif', 'Jalalabad', 'Kunduz', 'Ghazni', 'Balkh', 'Baghlan', 'Gardez'],
        'Albania': ['Tirana', 'Durrës', 'Vlorë', 'Elbasan', 'Shkodër', 'Fier', 'Korçë', 'Berat', 'Lushnjë', 'Pogradec'],
        'Algeria': ['Algiers', 'Oran', 'Constantine', 'Annaba', 'Blida', 'Béjaïa', 'Batna', 'Sétif', 'Sidi Bel Abbès', 'Biskra'],
        'Argentina': ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza', 'Tucumán', 'La Plata', 'Mar del Plata', 'Salta', 'Santa Fe', 'San Juan'],
        'Australia': ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast', 'Canberra', 'Newcastle', 'Wollongong', 'Logan City'],
        'Austria': ['Vienna', 'Graz', 'Linz', 'Salzburg', 'Innsbruck', 'Klagenfurt', 'Villach', 'Wels', 'Sankt Pölten', 'Dornbirn'],
        'Bangladesh': ['Dhaka', 'Chittagong', 'Khulna', 'Rajshahi', 'Sylhet', 'Barisal', 'Rangpur', 'Comilla', 'Narayanganj', 'Gazipur'],
        'Belgium': ['Brussels', 'Antwerp', 'Ghent', 'Charleroi', 'Liège', 'Bruges', 'Namur', 'Leuven', 'Mons', 'Aalst'],
        'Brazil': ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador', 'Fortaleza', 'Belo Horizonte', 'Manaus', 'Curitiba', 'Recife', 'Porto Alegre'],
        'Canada': ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Winnipeg', 'Quebec City', 'Hamilton', 'Kitchener'],
        'Chile': ['Santiago', 'Puente Alto', 'Antofagasta', 'Viña del Mar', 'Valparaíso', 'Talcahuano', 'San Bernardo', 'Temuco', 'Iquique', 'Concepción'],
        'China': ['Shanghai', 'Beijing', 'Guangzhou', 'Shenzhen', 'Tianjin', 'Chongqing', 'Hong Kong', 'Chengdu', 'Nanjing', 'Wuhan'],
        'Colombia': ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Cúcuta', 'Bucaramanga', 'Pereira', 'Santa Marta', 'Ibagué'],
        'Denmark': ['Copenhagen', 'Aarhus', 'Odense', 'Aalborg', 'Frederiksberg', 'Esbjerg', 'Randers', 'Kolding', 'Vejle', 'Roskilde'],
        'Egypt': ['Cairo', 'Alexandria', 'Giza', 'Port Said', 'Suez', 'Luxor', 'Mansoura', 'Tanta', 'Asyut', 'Ismailia'],
        'Finland': ['Helsinki', 'Espoo', 'Tampere', 'Vantaa', 'Oulu', 'Turku', 'Jyväskylä', 'Lahti', 'Kuopio', 'Kouvola'],
        'France': ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Strasbourg', 'Montpellier', 'Bordeaux', 'Lille'],
        'Germany': ['Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt', 'Stuttgart', 'Düsseldorf', 'Dortmund', 'Essen', 'Leipzig'],
        'Greece': ['Athens', 'Thessaloniki', 'Patras', 'Heraklion', 'Larissa', 'Volos', 'Rhodes', 'Ioannina', 'Chania', 'Chalcis'],
        'India': ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Ahmedabad', 'Chennai', 'Kolkata', 'Surat', 'Pune', 'Jaipur'],
        'Indonesia': ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Bekasi', 'Semarang', 'Tangerang', 'Makassar', 'Palembang', 'Depok'],
        'Ireland': ['Dublin', 'Cork', 'Limerick', 'Galway', 'Waterford', 'Drogheda', 'Dundalk', 'Bray', 'Navan', 'Kilkenny'],
        'Italy': ['Rome', 'Milan', 'Naples', 'Turin', 'Palermo', 'Genoa', 'Bologna', 'Florence', 'Bari', 'Catania'],
        'Japan': ['Tokyo', 'Yokohama', 'Osaka', 'Nagoya', 'Sapporo', 'Fukuoka', 'Kobe', 'Kawasaki', 'Saitama', 'Hiroshima'],
        'Jordan': ['Amman', 'Zarqa', 'Irbid', 'Russeifa', 'Al-Quwaysimah', 'Wadi Al-Seer', 'Tafilah', 'Madaba', 'Sahab', 'Jalul'],
        'Kenya': ['Nairobi', 'Mombasa', 'Nakuru', 'Eldoret', 'Kisumu', 'Thika', 'Malindi', 'Kitale', 'Garissa', 'Kakamega'],
        'Malaysia': ['Kuala Lumpur', 'George Town', 'Johor Bahru', 'Ipoh', 'Kuching', 'Shah Alam', 'Kota Kinabalu', 'Seremban', 'Kuantan', 'Petaling Jaya'],
        'Mexico': ['Mexico City', 'Tijuana', 'Ecatepec', 'León', 'Puebla', 'Ciudad Juárez', 'Guadalajara', 'Zapopan', 'Monterrey', 'Chihuahua'],
        'Morocco': ['Casablanca', 'Rabat', 'Fès', 'Sale', 'Marrakech', 'Agadir', 'Tangier', 'Meknès', 'Oujda', 'Kenitra'],
        'Netherlands': ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven', 'Tilburg', 'Groningen', 'Almere', 'Breda', 'Nijmegen'],
        'New Zealand': ['Auckland', 'Wellington', 'Christchurch', 'Manurewa', 'Hamilton', 'Lower Hutt', 'Tauranga', 'Dunedin', 'Palmerston North', 'Napier'],
        'Nigeria': ['Lagos', 'Abuja', 'Kano', 'Ibadan', 'Port Harcourt', 'Benin City', 'Kaduna', 'Jos', 'Ilorin', 'Oyo'],
        'Norway': ['Oslo', 'Bergen', 'Trondheim', 'Stavanger', 'Drammen', 'Fredrikstad', 'Kristiansand', 'Sandnes', 'Tromsø', 'Sarpsborg'],
        'Pakistan': ['Karachi', 'Lahore', 'Faisalabad', 'Rawalpindi', 'Gujranwala', 'Peshawar', 'Multan', 'Hyderabad', 'Islamabad', 'Quetta'],
        'Peru': ['Lima', 'Arequipa', 'Trujillo', 'Chiclayo', 'Piura', 'Iquitos', 'Cusco', 'Chimbote', 'Huancayo', 'Tacna'],
        'Philippines': ['Quezon City', 'Manila', 'Caloocan', 'Davao City', 'Cebu City', 'Zamboanga City', 'Taguig', 'Antipolo', 'Pasig', 'Cagayan de Oro'],
        'Poland': ['Warsaw', 'Kraków', 'Łódź', 'Wrocław', 'Poznań', 'Gdańsk', 'Szczecin', 'Bydgoszcz', 'Lublin', 'Katowice'],
        'Portugal': ['Lisbon', 'Porto', 'Amadora', 'Braga', 'Setúbal', 'Coimbra', 'Queluz', 'Funchal', 'Cacém', 'Vila Nova de Gaia'],
        'Russia': ['Moscow', 'Saint Petersburg', 'Novosibirsk', 'Yekaterinburg', 'Nizhny Novgorod', 'Kazan', 'Chelyabinsk', 'Omsk', 'Samara', 'Rostov-on-Don'],
        'Saudi Arabia': ['Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Sultanah', 'Dammam', 'Taif', 'Tabuk', 'Buraidah', 'Khamis Mushait'],
        'Singapore': ['Singapore'],
        'South Africa': ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Port Elizabeth', 'Bloemfontein', 'East London', 'Pietermaritzburg', 'Benoni', 'Tembisa'],
        'South Korea': ['Seoul', 'Busan', 'Incheon', 'Daegu', 'Daejeon', 'Gwangju', 'Suwon', 'Ulsan', 'Changwon', 'Seongnam'],
        'Spain': ['Madrid', 'Barcelona', 'Valencia', 'Seville', 'Zaragoza', 'Málaga', 'Murcia', 'Palma', 'Las Palmas', 'Bilbao'],
        'Sweden': ['Stockholm', 'Gothenburg', 'Malmö', 'Uppsala', 'Linköping', 'Västerås', 'Örebro', 'Helsingborg', 'Norrköping', 'Jönköping'],
        'Switzerland': ['Zürich', 'Geneva', 'Basel', 'Lausanne', 'Bern', 'Winterthur', 'Lucerne', 'St. Gallen', 'Lugano', 'Biel/Bienne'],
        'Thailand': ['Bangkok', 'Nonthaburi', 'Nakhon Ratchasima', 'Chiang Mai', 'Hat Yai', 'Pak Kret', 'Si Racha', 'Phra Pradaeng', 'Lampang', 'Khon Kaen'],
        'Turkey': ['Istanbul', 'Ankara', 'İzmir', 'Bursa', 'Adana', 'Gaziantep', 'Konya', 'Antalya', 'Kayseri', 'Mersin'],
        'Ukraine': ['Kyiv', 'Kharkiv', 'Dnipro', 'Odesa', 'Donetsk', 'Zaporizhzhia', 'Lviv', 'Kryvyi Rih', 'Mykolaiv', 'Mariupol'],
        'United Arab Emirates': ['Dubai', 'Abu Dhabi', 'Sharjah', 'Al Ain', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'],
        'United Kingdom': ['London', 'Birmingham', 'Manchester', 'Liverpool', 'Leeds', 'Sheffield', 'Bristol', 'Newcastle', 'Sunderland', 'Brighton'],
        'United States': ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose'],
        'Vietnam': ['Ho Chi Minh City', 'Hanoi', 'Da Nang', 'Haiphong', 'Biên Hòa', 'Cần Thơ', 'Huế', 'Nha Trang', 'Cam Ranh', 'Vũng Tàu']
      }

      const citiesPromises = selectedCountries.map(async (country: string) => {
        try {
          const response = await fetch('https://countriesnow.space/api/v0.1/countries/cities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country })
          })
          if (response.ok) {
            const data = await response.json()
            const apiCities = data.data || []
            // If API returns cities, use them; otherwise use fallback
            return apiCities.length > 0 ? apiCities : (fallbackCities[country] || [`${country} City`, 'Other'])
          } else {
            return fallbackCities[country] || [`${country} City`, 'Other']
          }
        } catch {
          return fallbackCities[country] || [`${country} City`, 'Other']
        }
      })

      const citiesArrays = await Promise.all(citiesPromises)
      const allCities = citiesArrays.flat()
      return [...new Set(allCities)].sort() // Remove duplicates and sort
    },
    enabled: selectedCountries.length > 0,
    staleTime: 60 * 60 * 1000 // 1 hour
  })

  const watchedValues = watch()

  // Sync ageRangesSelected with form
  React.useEffect(() => {
    const current = watch('ageRanges') || []
    setAgeRangesSelected(current)
  }, [watch('ageRanges')])

  const handleAgeRangeChange = (option: string, checked: boolean) => {
    let newSelected = [...ageRangesSelected]
    if (option === 'All of the above (Mixed Family members)') {
      if (checked) {
        newSelected = ageRangeOptions.slice(0, 3) // All except "All"
      } else {
        newSelected = []
      }
    } else {
      if (checked) {
        newSelected.push(option)
      } else {
        newSelected = newSelected.filter(r => r !== option)
        // If "All" was checked and we unchecked one, uncheck "All"
        if (newSelected.includes('All of the above (Mixed Family members)')) {
          newSelected = newSelected.filter(r => r !== 'All of the above (Mixed Family members)')
        }
      }
    }
    setValue('ageRanges', newSelected)
  }

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const onSubmit = async (data: OnboardingForm) => {
    if (!user) return

    setSubmitting(true)
    setApiResponse(null)

    try {
      // Prepare data for the Edge Function
      const onboardingData = {
        userId: user.id,
        carePreference: data.carePreference,
        mattersMost: data.mattersMost,
        ageRanges: data.ageRanges,
        fundingFrequency: data.fundingFrequency,
        paymentFrequency: data.paymentFrequency,
        numberOfLovedOnes: data.numberOfLovedOnes,
        lovedOnesCountries: data.lovedOnesCountries,
        lovedOnesCities: data.lovedOnesCities,
      }

      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/complete-onboarding`
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession()
      if (sessErr) throw sessErr
      const accessToken = sessionData?.session?.access_token
      if (!accessToken) throw new Error('Missing access token')

      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(onboardingData),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result?.error || `Onboarding completion failed`)
      }

      // Show API response in UI without page refresh
      setApiResponse(result)

      // Make sure local session metadata reflects onboarding completion to prevent redirects back here
      // Even though the edge function updates auth.users, refreshing local session avoids stale metadata
      await supabase.auth.updateUser({ data: { onboarding_completed: true } }).catch(() => {})

      // Invalidate queries and wait for them to settle
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['onboarding-status', user.id] }),
        queryClient.invalidateQueries({ queryKey: ['profile', user.id] }),
      ])
    } catch (error: any) {
      console.error('Error completing onboarding:', error)
      setApiResponse({ error: error.message || 'Failed to complete onboarding. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const saveProgressAndContinue = async () => {
    if (!user) return

    try {
      const currentData = watch()
      await supabase.from('user_onboarding').upsert({
        user_id: user.id,
        care_preference: currentData.carePreference,
        matters_most: currentData.mattersMost,
        age_ranges: currentData.ageRanges,
        funding_frequency: currentData.fundingFrequency,
        payment_frequency: currentData.paymentFrequency,
        number_of_loved_ones: currentData.numberOfLovedOnes
      })

      // Redirect to dashboard - user can return to onboarding later
      window.location.href = '/dashboard'
    } catch (error) {
      console.error('Error saving progress:', error)
    }
  }

  const handleLogout = async () => {
    await signOut()
  }

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div>
            <h3 className="text-lg font-medium mb-4">What type of care are you looking for?</h3>
            <div className="space-y-2">
              {['Everyday checkups', 'Emergency protection', 'Full coverage', 'Not sure yet'].map(option => (
                <label key={option} className="flex items-center">
                  <input
                    type="radio"
                    value={option}
                    {...register('carePreference')}
                    className="mr-2"
                  />
                  {option}
                </label>
              ))}
            </div>
          </div>
        )
      case 1:
        return (
          <div>
            <h3 className="text-lg font-medium mb-4">What matters most to you?</h3>
            <div className="space-y-2">
              {[
                'Peace of mind before emergencies',
                'Proactive healthcare for loved ones',
                'Immediate access to clinics',
                'Lower cost than cash',
                'Simple, one membership for family'
              ].map(option => (
                <label key={option} className="flex items-center">
                  <input
                    type="checkbox"
                    value={option}
                    {...register('mattersMost')}
                    className="mr-2"
                  />
                  {option}
                </label>
              ))}
            </div>
          </div>
        )
      case 2:
        return (
          <div>
            <h3 className="text-lg font-medium mb-4">Select the age ranges of your loved ones</h3>
            <div className="space-y-2">
              {ageRangeOptions.map(option => (
                <label key={option} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={ageRangesSelected.includes(option)}
                    onChange={(e) => handleAgeRangeChange(option, e.target.checked)}
                    className="mr-2"
                  />
                  {option}
                </label>
              ))}
            </div>
          </div>
        )
      case 3:
        return (
          <div>
            <h3 className="text-lg font-medium mb-4">How often would you like to fund healthcare?</h3>
            <div className="space-y-2">
              {['Monthly', 'Quarterly', 'Bi-annually', 'Annually'].map(option => (
                <label key={option} className="flex items-center">
                  <input
                    type="radio"
                    value={option}
                    {...register('fundingFrequency')}
                    className="mr-2"
                  />
                  {option}
                </label>
              ))}
            </div>
          </div>
        )
      case 4:
        const filteredCountries = countries.filter((country: string) =>
          country.toLowerCase().includes(searchCountry.toLowerCase())
        )
        return (
          <div>
            <h3 className="text-lg font-medium mb-4">Select countries where your loved ones live</h3>
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search countries..."
                value={searchCountry}
                onChange={(e) => setSearchCountry(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="max-h-64 overflow-y-auto border rounded p-4">
              <div className="grid grid-cols-2 gap-2">
                {filteredCountries.map((country: string) => (
                  <label key={country} className="flex items-center">
                    <input
                      type="checkbox"
                      value={country}
                      {...register('lovedOnesCountries')}
                      className="mr-2"
                    />
                    {country}
                  </label>
                ))}
              </div>
              {filteredCountries.length === 0 && searchCountry && (
                <p className="text-gray-500 text-center mt-4">No countries found matching "{searchCountry}"</p>
              )}
            </div>
          </div>
        )
      case 5:
        const filteredCities = cities.filter((city: string) =>
          city.toLowerCase().includes(searchCity.toLowerCase())
        )
        return (
          <div>
            <h3 className="text-lg font-medium mb-4">Select cities/states</h3>
            {selectedCountries.length === 0 ? (
              <p className="text-gray-600">Please select countries first to load cities.</p>
            ) : cities.length === 0 ? (
              <p className="text-gray-600">Loading cities...</p>
            ) : (
              <>
                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Search cities..."
                    value={searchCity}
                    onChange={(e) => setSearchCity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto border rounded p-4">
                  <div className="grid grid-cols-2 gap-2">
                    {filteredCities.map((city: string) => (
                      <label key={city} className="flex items-center">
                        <input
                          type="checkbox"
                          value={city}
                          {...register('lovedOnesCities')}
                          className="mr-2"
                        />
                        {city}
                      </label>
                    ))}
                  </div>
                  {filteredCities.length === 0 && searchCity && (
                    <p className="text-gray-500 text-center mt-4">No cities found matching "{searchCity}"</p>
                  )}
                </div>
              </>
            )}
          </div>
        )
      case 6:
        return (
          <div>
            <h3 className="text-lg font-medium mb-4">How many loved ones do you want to cover?</h3>
            <div className="space-y-4">
              <div className="text-center">
                <span className="text-2xl font-bold text-blue-600">{watch('numberOfLovedOnes') || 1}</span>
                <span className="text-gray-600 ml-2">loved ones</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                {...register('numberOfLovedOnes', { valueAsNumber: true })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-sm text-gray-500">
                <span>1</span>
                <span>10</span>
              </div>
            </div>
          </div>
        )
      case 7:
        return (
          <div>
            <h3 className="text-lg font-medium mb-4">Preferred payment frequency</h3>
            <div className="space-y-2">
              {['Quarterly-plan', 'Bi-annual', 'Annual'].map(option => (
                <label key={option} className="flex items-center">
                  <input
                    type="radio"
                    value={option}
                    {...register('paymentFrequency')}
                    className="mr-2"
                  />
                  {option}
                </label>
              ))}
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">HealthGuard Onboarding</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Logout
          </button>
        </div>
        <div className="bg-white rounded-lg shadow p-8">
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              {steps.map((step, index) => (
                <div
                  key={step}
                  className={`flex-1 text-center ${index <= currentStep ? 'text-blue-600' : 'text-gray-400'}`}
                >
                  <div className={`w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center ${
                    index < currentStep ? 'bg-blue-600 text-white' :
                    index === currentStep ? 'bg-blue-200 text-blue-600' : 'bg-gray-200'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="text-xs">{step}</div>
                </div>
              ))}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              ></div>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>
            {renderStep()}

            <div className="flex justify-between items-center mt-8">
              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={prevStep}
                  disabled={currentStep === 0}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={saveProgressAndContinue}
                  className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                >
                  Save & Continue Later
                </button>
              </div>
              {currentStep < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="px-4 py-2 bg-blue-600 text-white rounded"
                >
                  Next
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
                >
                  {submitting ? 'Completing...' : 'Complete Onboarding'}
                </button>
              )}
            </div>
          </form>
          {apiResponse && (
            <div className="mt-6 p-4 border rounded bg-green-50">
              <h4 className="font-semibold text-green-700 mb-2">Onboarding Response</h4>
              <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{JSON.stringify(apiResponse, null, 2)}</pre>
              <div className="mt-4">
                <button
                  onClick={() => navigate(`/plans?quantity=${watchedValues.numberOfLovedOnes || 1}`)}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Continue to Plans
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Onboarding