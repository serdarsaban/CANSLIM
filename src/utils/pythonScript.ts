export const canslimPythonCode = `import streamlit as st
import yfinance as yf
import pandas as pd
import datetime
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
import io

# Set page configurations
st.set_page_config(
    page_title="CANSLIM Stock Screener & Analyzer",
    page_icon="📈",
    layout="wide"
)

# Header
st.title("📈 CANSLIM Stock Analyzer & Real-Time Dashboard")
st.markdown("""
This interactive system uses the **CANSLIM methodology** created by William O'Neil to evaluate stocks 
based on real-time fundamental data from free financial APIs (**yfinance**).
""")

# Sidebar settings
st.sidebar.header("🔍 Analyzer Controls")
ticker_input = st.sidebar.text_input("Enter Stock Ticker:", value="AAPL").upper().strip()
analyze_btn = st.sidebar.button("Run CANSLIM Analysis", type="primary")

def get_market_trend():
    \"\"\"Determine general Nasdaq/S&P 500 trend (M of CANSLIM)\"\"\"
    try:
        spy = yf.Ticker("^GSPC")
        hist = spy.history(period="6mo")
        if len(hist) < 50:
            return "Uptrend (Inconclusive)", 8
        
        current_price = hist['Close'].iloc[-1]
        ma_50 = hist['Close'].rolling(window=50).mean().iloc[-1]
        ma_200 = hist['Close'].rolling(window=200).mean().iloc[-1]
        
        if current_price > ma_50 > ma_200:
            return "Confirmed Uptrend (Market is Safe)", 10
        elif current_price > ma_200:
            return "Market in Correction / Volatile", 6
        else:
            return "Confirmed Downtrend (Bear Market)", 2
    except:
        return "Confirmed Uptrend (Assumed)", 8

def calculate_canslim(ticker_name):
    # Retrieve real-time data
    with st.spinner(f"Pulling real-time fundamental data for {ticker_name}..."):
        try:
            stock = yf.Ticker(ticker_name)
            info = stock.info
            
            # 1. Fetch financial statements
            quarterly_financials = stock.quarterly_financials
            financials = stock.financials
            
            # Fallbacks in case information is nested or empty
            company_name = info.get("longName", ticker_name)
            
            # C - Current Quarterly Earnings (YoY Growth)
            eps_yo_y = None
            sales_yo_y = None
            c_score = 5
            c_details = "Quarterly financials unavailable or missing YoY quarterly metrics."
            
            # Try to calculate YoY quarterly EPS & revenue growth
            if quarterly_financials is not None and not quarterly_financials.empty:
                try:
                    # Revenue (or Total Revenue) Row lookup
                    rev_row = [r for r in quarterly_financials.index if "Revenue" in r or "Sales" in r]
                    if rev_row:
                        rev_series = quarterly_financials.loc[rev_row[0]]
                        if len(rev_series) >= 5:
                            latest_rev = rev_series.iloc[0]
                            last_year_rev = rev_series.iloc[4] # same quarter last year (4 quarters back)
                            sales_yo_y = ((latest_rev - last_year_rev) / last_year_rev) * 100
                    
                    # EPS (or Net Income) Row lookup
                    ni_row = [r for r in quarterly_financials.index if "Net Income" in r]
                    if ni_row:
                        ni_series = quarterly_financials.loc[ni_row[0]]
                        if len(ni_series) >= 5:
                            latest_ni = ni_series.iloc[0]
                            last_year_ni = ni_series.iloc[4]
                            eps_yo_y = ((latest_ni - last_year_ni) / last_year_ni) * 100
                except Exception as e:
                    pass

            # Score C
            if eps_yo_y is not None:
                if eps_yo_y >= 25:
                    c_score = 9 if eps_yo_y >= 50 else 8
                    c_details = f"Exceptional {eps_yo_y:.1f}% YoY profit expansion. Meets CANSLIM rule (>25%)."
                else:
                    c_score = 4
                    c_details = f"EPS grew by {eps_yo_y:.1f}% YoY, which is below the 25% guideline."
            else:
                # Fallback to info growth rate
                eps_growth = info.get("earningsQuarterlyGrowth", None)
                if eps_growth is not None:
                    eps_yo_y = eps_growth * 100
                    c_score = 8 if eps_yo_y >= 25 else 4
                    c_details = f"Quarterly growth reports {eps_yo_y:.1f}% growth YoY."

            # A - Annual Earnings Increases
            roe = info.get("returnOnEquity", 0.0) * 100
            a_score = 5
            a_details = "Insufficient historical records."
            
            if roe > 0:
                if roe >= 17:
                    a_score = 9
                    a_details = f"Superb profitability with {roe:.1f}% ROE, exceeding William O'Neil's 17% filter."
                else:
                    a_score = 5
                    a_details = f"Return on Equity (ROE) is {roe:.1f}%, which lags the 17% benchmark."

            # N - New Product, Service, management, or Price Highs
            fifty_two_week_high = info.get("fiftyTwoWeekHigh", 1.0)
            current_price = info.get("currentPrice", info.get("previousClose", 1.0))
            distance_from_high = ((fifty_two_week_high - current_price) / fifty_two_week_high) * 100
            
            n_score = 5
            n_details = ""
            if distance_from_high <= 15:
                n_score = 9
                n_details = f"Trading only {distance_from_high:.1f}% below its 52-week high, indicating strong upside momentum and base breakout potential."
            else:
                n_score = 6
                n_details = f"Trading {distance_from_high:.1f}% below 52-week high. Base reconstruction in progress."
            
            # S - Supply and Demand (Float and Volume)
            shares_out = info.get("sharesOutstanding", 0)
            avg_vol = info.get("averageVolume", 1)
            vol_status = "Moderate supply"
            s_score = 7
            if shares_out > 0:
                if shares_out < 100000000: # Small cap / low supply
                    s_score = 9
                    vol_status = "Very attractive small float stock (highly responsive, low shares supply)"
                else:
                    s_score = 7
                    vol_status = "High institutional float (requires heavy buying pressure to move)"

            # L - Leader or Laggard
            # Look at beta and price vs moving averages
            beta = info.get("beta", 1.0)
            fifty_ma = info.get("fiftyDayAverage", 1.0)
            two_hundred_ma = info.get("twoHundredDayAverage", 1.0)
            
            l_score = 5
            l_details = "Underperforming the industry trackers."
            if current_price > fifty_ma > two_hundred_ma:
                l_score = 9
                l_details = "Strong momentum! Price sits over both the 50-day and 200-day moving averages, confirming industry leadership."
            elif current_price > two_hundred_ma:
                l_score = 7
                l_details = "Moderate leader. Price is above the long-term 200-day average but below near-term trendlines."
            else:
                l_score = 3
                l_details = "Lagging ticker. Currently trading in bearish cycles below its key moving averages."

            # I - Institutional Sponsorship
            inst_ownership = info.get("heldPercentInstitutions", 0.0) * 100
            i_score = 6
            i_details = f"Institutional backing represents {inst_ownership:.1f}% representation."
            if inst_ownership >= 30:
                i_score = 9
                i_details = f"Solid sponsorship from institutions ({inst_ownership:.1f}%), ensuring robust capital backup."
            elif inst_ownership > 0:
                i_score = 6
                i_details = f"Light institutional representation ({inst_ownership:.1f}%). High retail presence."

            # M - Market Direction
            m_verdict, m_score = get_market_trend()
            m_details = f"Current Market Status: {m_verdict}. S&P 500 support lines analyzed."

            # Aggregate scores
            total_score = c_score + a_score + n_score + s_score + l_score + i_score + m_score
            verdict = "Outstanding Leader (High Conviction)" if total_score >= 55 else "Watchlist Candidate" if total_score >= 40 else "Avoid / Lagging Ticker"

            # Create a history chart dataframe
            chart_data = None
            if quarterly_financials is not None and not quarterly_financials.empty:
                try:
                    labels = [col.strftime('%Y-%m') if isinstance(col, datetime.date) else str(col) for col in quarterly_financials.columns[:4]]
                    rev_val = quarterly_financials.loc[rev_row[0]].iloc[:4].values if rev_row else [0]*4
                    chart_data = pd.DataFrame({
                        'Quarter': list(reversed(labels)),
                        'Revenue': list(reversed([float(v)/1e9 if v else 0.0 for v in rev_val]))
                    })
                except:
                    pass

            return {
                "ticker": ticker_name,
                "company_name": company_name,
                "score": total_score,
                "max_score": 70,
                "verdict": verdict,
                "summary": f"{company_name} marks a total CANSLIM profile rating of {total_score}/70. {c_details}",
                "c": {"score": c_score, "val": eps_yo_y, "details": c_details},
                "a": {"score": a_score, "val": roe, "details": a_details},
                "n": {"score": n_score, "details": n_details},
                "s": {"score": s_score, "details": vol_status},
                "l": {"score": l_score, "details": l_details},
                "i": {"score": i_score, "details": i_details},
                "m": {"score": m_score, "details": m_details},
                "chart_data": chart_data
            }
        except Exception as ex:
            st.error(f"Failed to fetch data for {ticker_name}: {ex}")
            return None

# Trigger logic
if ticker_input or analyze_btn:
    data = calculate_canslim(ticker_input)
    if data:
        # Score banner
        col1, col2, col3 = st.columns([1, 2, 1])
        with col1:
            st.metric("Total CANSLIM Score", f"{data['score']} / 70")
        with col2:
            st.subheader(f"{data['company_name']} ({data['ticker']})")
            st.caption(f"Verdict: **{data['verdict']}**")
        with col3:
            st.progress(float(data['score']) / 70.0)

        st.write("---")
        
        # Grid layout for letters
        c_col, a_col, n_col = st.columns(3)
        with c_col:
            st.markdown(f"### 🟢 [C] Current Quarterly Earnings")
            st.markdown(f"**Score:** {data['c']['score']}/10")
            if data['c']['val'] is not None:
                st.metric("Quarterly EPS YoY Growth", f"{data['c']['val']:.2f}%")
            st.write(data['c']['details'])
            
        with a_col:
            st.markdown(f"### 🟢 [A] Annual Earnings Increases")
            st.markdown(f"**Score:** {data['a']['score']}/10")
            if data['a']['val'] is not None:
                st.metric("Return on Equity (ROE)", f"{data['a']['val']:.2f}%")
            st.write(data['a']['details'])
            
        with n_col:
            st.markdown(f"### 🟢 [N] New Catalysts & Highs")
            st.markdown(f"**Score:** {data['n']['score']}/10")
            st.write(data['n']['details'])
            
        st.write("---")
        
        s_col, l_col, i_col, m_col = st.columns(4)
        with s_col:
            st.markdown(f"### [S] Supply")
            st.markdown(f"**Score:** {data['s']['score']}/10")
            st.write(data['s']['details'])
        with l_col:
            st.markdown(f"### [L] Leader")
            st.markdown(f"**Score:** {data['l']['score']}/10")
            st.write(data['l']['details'])
        with i_col:
            st.markdown(f"### [I] Sponsorship")
            st.markdown(f"**Score:** {data['i']['score']}/10")
            st.write(data['i']['details'])
        with m_col:
            st.markdown(f"### [M] Market Direction")
            st.markdown(f"**Score:** {data['m']['score']}/10")
            st.write(data['m']['details'])

        st.write("---")
        
        # Chart and Report Download
        left_col, right_col = st.columns(2)
        with left_col:
            st.subheader("📊 Recent Revenue Trend (Billions $)")
            if data['chart_data'] is not None and not data['chart_data'].empty:
                st.bar_chart(data['chart_data'].set_index('Quarter'))
            else:
                st.info("Chart data could not be computed for this ticker.")
                
        with right_col:
            st.subheader("🖨️ PDF Report Exporter")
            st.write("Export these CANSLIM insights into a publication-ready PDF report.")
            
            # Simple PDF report generation using ReportLab
            def generate_pdf(results):
                buffer = io.BytesIO()
                doc = SimpleDocTemplate(buffer, pagesize=letter)
                styles = getSampleStyleSheet()
                
                # Custom styles
                title_style = ParagraphStyle(
                    'HeaderStyle',
                    parent=styles['Heading1'],
                    fontSize=24,
                    textColor=colors.HexColor('#0F172A'),
                    spaceAfter=15
                )
                subtitle_style = ParagraphStyle(
                    'SubStyle',
                    parent=styles['Normal'],
                    fontSize=12,
                    textColor=colors.HexColor('#475569'),
                    spaceAfter=25
                )
                body_style = ParagraphStyle(
                    'BodyStyle',
                    parent=styles['BodyText'],
                    fontSize=10,
                    textColor=colors.HexColor('#1E293B'),
                    spaceAfter=8
                )
                
                story = []
                
                story.append(Paragraph(f"CANSLIM Assessment Report: {results['company_name']}", title_style))
                story.append(Paragraph(f"Ticker: {results['ticker']} | Generated on: {datetime.date.today()} | Overall Rating: {results['score']}/70", subtitle_style))
                story.append(Spacer(1, 10))
                
                # Summary table
                table_data = [
                    [Paragraph("<b>CANSLIM Factor</b>", body_style), Paragraph("<b>Score</b>", body_style), Paragraph("<b>Status & Calculations</b>", body_style)],
                    [Paragraph("<b>[C] Current Earnings</b>", body_style), f"{results['c']['score']}/10", Paragraph(results['c']['details'], body_style)],
                    [Paragraph("<b>[A] Annual Increases</b>", body_style), f"{results['a']['score']}/10", Paragraph(results['a']['details'], body_style)],
                    [Paragraph("<b>[N] New Catalyst</b>", body_style), f"{results['n']['score']}/10", Paragraph(results['n']['details'], body_style)],
                    [Paragraph("<b>[S] Supply</b>", body_style), f"{results['s']['score']}/10", Paragraph(results['s']['details'], body_style)],
                    [Paragraph("<b>[L] Leader</b>", body_style), f"{results['l']['score']}/10", Paragraph(results['l']['details'], body_style)],
                    [Paragraph("<b>[I] Sponsorship</b>", body_style), f"{results['i']['score']}/10", Paragraph(results['i']['details'], body_style)],
                    [Paragraph("<b>[M] Market Direction</b>", body_style), f"{results['m']['score']}/10", Paragraph(results['m']['details'], body_style)]
                ]
                
                t = Table(table_data, colWidths=[150, 60, 330])
                t.setStyle(TableStyle([
                    ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F1F5F9')),
                    ('VALIGN', (0,0), (-1,-1), 'TOP'),
                    ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
                    ('PADDING', (0,0), (-1,-1), 8),
                ]))
                
                story.append(t)
                story.append(Spacer(1, 20))
                
                # Final verdict
                story.append(Paragraph(f"<b>Final Investment Decision:</b> {results['verdict']}", styles['Heading3']))
                story.append(Paragraph(results['summary'], body_style))
                
                doc.build(story)
                buffer.seek(0)
                return buffer.getvalue()
            
            pdf_bytes = generate_pdf(data)
            st.download_button(
                label="📥 Download Analysis as PDF",
                data=pdf_bytes,
                file_name=f"{data['ticker']}_CANSLIM_Report.pdf",
                mime="application/pdf"
            )
`;
